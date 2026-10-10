import type { Pool } from "pg"

// What stands around a parcel and what Lexicon holds about the crop grown on it.
// Each function answers undefined when its tables are not in service.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

// About 500 metres, in degrees: how far water is looked for
const WATER_REACH_IN_DEGREES = 0.006
const WATER_SHOWN = 3
const DOCUMENTS_SHOWN = 3

// What is not water one treats away from: lights, beacons and banks of the coast.
// A watercourse as a whole is left out too: its stretches tell it, with their status
const NOT_WATER = ["Feu", "Balise", "Amer", "Banc", "Inconnue", "watercourse"]

export type Place = Readonly<{
  longitude: number
  latitude: number
  // Distances are measured from the parcel when there is one, from the point otherwise
  parcelId?: string
}>

export type WaterNearby = Readonly<{
  nature: string
  name?: string
  // Metres
  distance: number
  // Water all year (true), part of the year (false); absent when the IGN does not say
  permanent?: boolean
  // A ditch, not a watercourse
  ditch?: boolean
  // What the inventory of the water police says of a stretch: Inscrit, Non inscrit, Expertise en cours
  "water-police"?: string
  // Width at bankfull, as the IGN classes it
  width?: string
}>

export type CropContext = Readonly<{
  production: string
  // The crop as plant protection usages name it, and what is authorised on it
  usages?: { crop: string; count: number; products: number }
  documents?: {
    // The department, or its region when no document names the department
    area: { kind: string; code: string }
    total: number
    latest: { id: string; title: string; year?: number; publisher?: string }[]
  }
  workflows: { reference: string; system?: string }[]
  // The latest national price of the species
  price?: {
    value: number
    unit: string
    campaign: number
    specie: string
    // farmer_price, matif_price or shipping_price
    nature: string
    national: boolean
  }
}>

const rowsOf = <Row>(db: Pool, sql: string, values: unknown[]) =>
  db
    .query(sql, values)
    .then((result) => result.rows as Row[])
    .catch(() => undefined)

// The columns of a table, asked again every five minutes: a package put in
// service while the API runs may bring new ones
const COLUMNS_KEPT_FOR = 5 * 60 * 1000
const columnsKnown = new Map<string, { at: number; columns: Set<string> }>()

async function columnsOf(db: Pool, name: string): Promise<Set<string>> {
  const known = columnsKnown.get(name)
  if (known && Date.now() - known.at < COLUMNS_KEPT_FOR) {
    return known.columns
  }

  const rows = await rowsOf<{ column_name: string }>(
    db,
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2;`,
    [SCHEMA, name],
  )
  const columns = new Set((rows ?? []).map((row) => row.column_name))
  columnsKnown.set(name, { at: Date.now(), columns })

  return columns
}

const nameOf = (name: unknown): string | undefined =>
  typeof name === "string"
    ? name
    : name !== null && typeof name === "object"
      ? ((name as Record<string, string>).fra ?? Object.values(name as object)[0])
      : undefined

/**
 * The water closest to a place: watercourses, ponds, reservoirs, springs. Buffer zones
 * of plant protection products are counted from them.
 */
export async function waterNear(
  db: Pool,
  place: Place,
): Promise<WaterNearby[] | undefined> {
  const origin = place.parcelId
    ? `COALESCE((SELECT shape FROM ${table("registered_cadastral_parcels")} WHERE id = $3), postgis.ST_SetSRID(postgis.ST_MakePoint($1, $2), 4326))`
    : `postgis.ST_SetSRID(postgis.ST_MakePoint($1, $2), 4326)`
  const values = place.parcelId
    ? [place.longitude, place.latitude, place.parcelId]
    : [place.longitude, place.latitude]

  // Persistence, ditches and the water police came with the BD TOPO of September 2026
  const detailed = (await columnsOf(db, "registered_hydrographic_items")).has("water_police")
  const details = detailed
    ? "h.permanent, h.ditch, h.water_police, h.width_class,"
    : "NULL AS permanent, NULL AS ditch, NULL AS water_police, NULL AS width_class,"

  const rows = await rowsOf<{
    nature: string
    name: unknown
    distance: string
    permanent: boolean | null
    ditch: boolean | null
    water_police: string | null
    width_class: string | null
  }>(
    db,
    `WITH origin AS (SELECT ${origin} AS shape)
     SELECT h.nature, h.name, ${details}
       round(postgis.ST_Distance(
         postgis.ST_Transform(COALESCE(h.lines, h.shape, h.point), 2154),
         postgis.ST_Transform(origin.shape, 2154))) AS distance
     FROM ${table("registered_hydrographic_items")} h, origin
     WHERE (postgis.ST_DWithin(h.lines, origin.shape, ${WATER_REACH_IN_DEGREES})
         OR postgis.ST_DWithin(h.shape, origin.shape, ${WATER_REACH_IN_DEGREES})
         OR postgis.ST_DWithin(h.point, origin.shape, ${WATER_REACH_IN_DEGREES}))
       AND h.nature <> ALL($${values.length + 1})
       ${detailed ? "AND h.underground IS NOT TRUE" : ""}
     ORDER BY distance
     LIMIT 40;`,
    [...values, NOT_WATER],
  )

  if (rows === undefined) {
    return undefined
  }

  // A watercourse is drawn in many stretches: the closest one tells it
  const closest = new Map<string, WaterNearby>()
  rows.forEach((row) => {
    const name = nameOf(row.name)
    const key = row.nature + "|" + (name ?? "")

    if (!closest.has(key)) {
      closest.set(key, {
        nature: row.nature,
        name,
        distance: Number(row.distance),
        permanent: row.permanent ?? undefined,
        ditch: row.ditch === true ? true : undefined,
        "water-police": row.water_police ?? undefined,
        width: row.width_class ?? undefined,
      })
    }
  })

  return [...closest.values()].slice(0, WATER_SHOWN)
}

export type BuildingsOnParcel = Readonly<{
  count: number
  // Square metres on the ground
  area: number
  // Those the IGN says are agricultural
  agricultural: number
}>

/**
 * The buildings standing on a parcel, as the BD TOPO of the IGN draws them.
 */
export async function buildingsOn(
  db: Pool,
  parcelId: string,
): Promise<BuildingsOnParcel | undefined> {
  const rows = await rowsOf<{ count: string; area: string | null; agricultural: string }>(
    db,
    `SELECT count(*) AS count,
       round(sum(postgis.ST_Area(postgis.ST_Transform(b.shape, 2154)))) AS area,
       count(*) FILTER (WHERE b.nature = 'Agricole') AS agricultural
     FROM ${table("registered_cadastral_buildings")} b
     JOIN ${table("registered_cadastral_parcels")} p ON postgis.ST_Intersects(b.shape, p.shape)
     WHERE p.id = $1;`,
    [parcelId],
  )

  return rows === undefined
    ? undefined
    : {
        count: Number(rows[0]?.count ?? 0),
        area: Number(rows[0]?.area ?? 0),
        agricultural: Number(rows[0]?.agricultural ?? 0),
      }
}

// Dwellings are counted within this distance, and looked for as far as water is
const DWELLINGS_COUNTED_WITHIN = 100
// A hedge closer than this runs along the parcel
const HEDGE_ALONG_WITHIN = 5
// Woods, vines and orchards are named when they stand within this distance
const VEGETATION_WITHIN = 100
const VEGETATION_SHOWN = 4

export type Surroundings = Readonly<{
  // Buildings that are dwellings: how many within 100 m, the closest in metres
  dwellings?: { within: number; count: number; nearest?: number }
  // Schools, hospitals, homes for the elderly within about 500 m, the closest first
  "sensitive-sites"?: { kind: string; name?: string; distance: number }[]
  // High-voltage lines over the parcel or within 100 m
  "power-lines"?: { voltage: string; distance: number }[]
  // Metres of hedge on the parcel or along it
  hedges?: number
  // Woods, vines, orchards: square metres on the parcel and its share in percent,
  // or the distance in metres when they stand beside it
  vegetation?: { nature: string; area: number; share: number; distance: number }[]
}>

// The parcel in degrees to search with the indexes, in Lambert 93 to measure
const parcelOrigin = `WITH origin AS (
  SELECT shape, postgis.ST_Transform(shape, 2154) AS flat
  FROM ${table("registered_cadastral_parcels")} WHERE id = $1)`

async function dwellingsNear(db: Pool, parcelId: string) {
  // A dwelling is a residential building, or one the land files count dwellings in
  const counted = (await columnsOf(db, "registered_cadastral_buildings")).has("dwellings_count")
  const dwelling = counted
    ? "(b.nature = 'Résidentiel' OR b.dwellings_count > 0) AND b.state IS DISTINCT FROM 'En projet' AND b.state IS DISTINCT FROM 'En ruine'"
    : "b.nature = 'Résidentiel'"

  const rows = await rowsOf<{ count: string; nearest: string | null }>(
    db,
    `${parcelOrigin}
     SELECT count(*) FILTER (WHERE distance <= ${DWELLINGS_COUNTED_WITHIN}) AS count,
       min(distance) AS nearest
     FROM (
       SELECT round(postgis.ST_Distance(postgis.ST_Transform(b.shape, 2154), origin.flat)) AS distance
       FROM ${table("registered_cadastral_buildings")} b, origin
       WHERE ${dwelling}
         AND postgis.ST_DWithin(b.shape, origin.shape, ${WATER_REACH_IN_DEGREES})) near;`,
    [parcelId],
  )
  const found = rows?.[0]

  return found
    ? {
        within: DWELLINGS_COUNTED_WITHIN,
        count: Number(found.count),
        nearest: found.nearest === null ? undefined : Number(found.nearest),
      }
    : undefined
}

async function hedgesAlong(db: Pool, parcelId: string) {
  const rows = await rowsOf<{ length: string | null }>(
    db,
    `${parcelOrigin}
     SELECT round(sum(postgis.ST_Length(postgis.ST_Intersection(
       postgis.ST_Transform(a.lines, 2154),
       postgis.ST_Buffer(origin.flat, ${HEDGE_ALONG_WITHIN}))))) AS length
     FROM ${table("registered_area_items")} a, origin
     WHERE a.nature = 'edge' AND postgis.ST_DWithin(a.lines, origin.shape, 0.0001);`,
    [parcelId],
  )

  return rows === undefined ? undefined : Number(rows[0]?.length ?? 0)
}

// Hedges are drawn as areas too: the lines above tell them
async function vegetationAround(db: Pool, parcelId: string) {
  const rows = await rowsOf<{ nature: string; area: string; share: string; distance: string }>(
    db,
    `${parcelOrigin}
     SELECT nature, round(sum(area)) AS area,
       round(100 * sum(area) / max(parcel_area)) AS share, min(distance) AS distance
     FROM (
       SELECT a.name->>'fra' AS nature,
         postgis.ST_Area(postgis.ST_Intersection(
           postgis.ST_Transform(postgis.ST_MakeValid(a.shape), 2154), origin.flat)) AS area,
         postgis.ST_Area(origin.flat) AS parcel_area,
         round(postgis.ST_Distance(postgis.ST_Transform(a.shape, 2154), origin.flat)) AS distance
       FROM ${table("registered_area_items")} a, origin
       WHERE a.nature = 'green_zone' AND a.name->>'fra' <> 'Haie'
         AND postgis.ST_DWithin(a.shape, origin.shape, 0.0015)) near
     WHERE distance <= ${VEGETATION_WITHIN}
     GROUP BY nature
     ORDER BY area DESC, distance
     LIMIT ${VEGETATION_SHOWN};`,
    [parcelId],
  )

  return rows?.map((row) => ({
    nature: row.nature,
    area: Number(row.area),
    share: Number(row.share),
    distance: Number(row.distance),
  }))
}

const SENSITIVE_SITES_SHOWN = 3
const SENSITIVE_SITES_WITHIN = 500
const POWER_LINES_WITHIN = 100

async function sensitiveSitesNear(db: Pool, parcelId: string) {
  const rows = await rowsOf<{ kind: string | null; name: unknown; distance: string }>(
    db,
    `${parcelOrigin}
     SELECT a.kind, a.name,
       round(postgis.ST_Distance(postgis.ST_Transform(a.shape, 2154), origin.flat)) AS distance
     FROM ${table("registered_area_items")} a, origin
     WHERE a.nature = 'sensitive_site'
       AND postgis.ST_DWithin(a.shape, origin.shape, ${WATER_REACH_IN_DEGREES})
     ORDER BY distance
     LIMIT ${SENSITIVE_SITES_SHOWN};`,
    [parcelId],
  )

  return rows
    ?.filter((row) => Number(row.distance) <= SENSITIVE_SITES_WITHIN)
    .map((row) => ({
    kind: row.kind ?? "",
    name: nameOf(row.name),
    distance: Number(row.distance),
  }))
}

async function powerLinesNear(db: Pool, parcelId: string) {
  const rows = await rowsOf<{ voltage: string | null; distance: string }>(
    db,
    `${parcelOrigin}
     SELECT a.kind AS voltage,
       min(round(postgis.ST_Distance(postgis.ST_Transform(a.lines, 2154), origin.flat))) AS distance
     FROM ${table("registered_area_items")} a, origin
     WHERE a.nature = 'power_line'
       AND postgis.ST_DWithin(a.lines, origin.shape, 0.0015)
     GROUP BY a.kind
     ORDER BY distance;`,
    [parcelId],
  )

  return rows
    ?.map((row) => ({ voltage: row.voltage ?? "", distance: Number(row.distance) }))
    .filter((line) => line.distance <= POWER_LINES_WITHIN)
}

export type ZoneAtPoint = Readonly<{
  // green_zone, protected_area, public_forest, sensitive_site
  nature: string
  // What the IGN calls it: Bois, Réserve naturelle, Forêt domaniale…
  kind?: string
  name?: string
}>

/**
 * The areas of the BD TOPO a point falls in: vegetation, protected areas,
 * public forests. Their shapes, some as large as a regional park, stay in the database.
 */
export async function zonesAt(
  db: Pool,
  place: { longitude: number; latitude: number },
): Promise<ZoneAtPoint[] | undefined> {
  const kind = (await columnsOf(db, "registered_area_items")).has("kind") ? "kind" : "NULL"
  const rows = await rowsOf<{ nature: string; kind: string | null; name: unknown }>(
    db,
    `SELECT nature, ${kind} AS kind, name
     FROM ${table("registered_area_items")}
     WHERE postgis.ST_Contains(shape, postgis.ST_SetSRID(postgis.ST_MakePoint($1, $2), 4326))
     ORDER BY nature, id;`,
    [place.longitude, place.latitude],
  )

  return rows?.map((row) => {
    const name = nameOf(row.name)
    const kindOf = row.kind ?? (row.nature === "green_zone" ? name : undefined)

    return {
      nature: row.nature,
      kind: kindOf ?? undefined,
      name: name === kindOf ? undefined : name,
    }
  })
}

/**
 * What stands around a parcel and weighs on how it is farmed: dwellings (safety
 * distances of treatments), hedges, woods, vines and orchards.
 */
export async function surroundingsOf(db: Pool, parcelId: string): Promise<Surroundings> {
  const [dwellings, hedges, vegetation, sensitiveSites, powerLines] = await Promise.all([
    dwellingsNear(db, parcelId),
    hedgesAlong(db, parcelId),
    vegetationAround(db, parcelId),
    sensitiveSitesNear(db, parcelId),
    powerLinesNear(db, parcelId),
  ])

  return {
    dwellings,
    hedges,
    vegetation,
    "sensitive-sites": sensitiveSites,
    "power-lines": powerLines,
  }
}

async function usagesOf(db: Pool, production: string) {
  const rows = await rowsOf<{ crop: string; count: string; products: string }>(
    db,
    `SELECT u.crop_label_fra AS crop, count(*) AS count, count(DISTINCT u.product_id) AS products
     FROM ${table("registered_phytosanitary_usages")} u
     WHERE u.state = 'authorized'
       AND u.crop_label_fra IN (
         SELECT tfi_label FROM ${table("master_crop_production_tfi_codes")} WHERE production = $1)
     GROUP BY u.crop_label_fra
     ORDER BY count DESC
     LIMIT 1;`,
    [production],
  )
  const found = rows?.[0]

  return found
    ? { crop: found.crop, count: Number(found.count), products: Number(found.products) }
    : undefined
}

async function documentsIn(db: Pool, production: string, kind: string, code: string) {
  const rows = await rowsOf<{
    id: string
    title: string
    year: number | null
    publisher: string | null
    total: string
  }>(
    db,
    `SELECT d.id, d.title, d.publication_year AS year, d.publisher_label AS publisher,
       count(*) OVER () AS total
     FROM ${table("registered_rd_agri_documents")} d
     JOIN ${table("registered_rd_agri_document_productions")} p
       ON p.document_id = d.id AND p.production = $1
     JOIN ${table("registered_rd_agri_document_areas")} a
       ON a.document_id = d.id AND a.area_kind = $2 AND a.area_code = $3
     ORDER BY d.publication_year DESC NULLS LAST, d.published_on DESC NULLS LAST, d.id
     LIMIT ${DOCUMENTS_SHOWN};`,
    [production, kind, code],
  )

  return rows === undefined || rows.length === 0
    ? undefined
    : {
        area: { kind, code },
        total: Number(rows[0].total),
        latest: rows.map((row) => ({
          id: row.id,
          title: row.title,
          year: row.year ?? undefined,
          publisher: row.publisher ?? undefined,
        })),
      }
}

// The documents about the department, or about its region when none names it
async function documentsOf(db: Pool, production: string, department?: string) {
  if (department === undefined) {
    return undefined
  }

  const local = await documentsIn(db, production, "department", department)
  if (local !== undefined) {
    return local
  }

  const region = (
    await rowsOf<{ code: string | null }>(
      db,
      `SELECT parent_code AS code FROM ${table("registered_administrative_areas")}
       WHERE kind = 'department' AND code = $1;`,
      [department],
    )
  )?.[0]?.code

  return region ? documentsIn(db, production, "region", region) : undefined
}

async function workflowsOf(db: Pool, production: string) {
  const rows = await rowsOf<{ reference: string; system: string | null }>(
    db,
    `SELECT reference_name AS reference, production_system AS system
     FROM ${table("technical_workflows")}
     WHERE production_reference_name = $1
     ORDER BY reference_name;`,
    [production],
  )

  return (rows ?? []).map((row) => ({
    reference: row.reference,
    system: row.system ?? undefined,
  }))
}

// Prices are few: the one paid to farmers comes before a market quotation, and
// the department before the whole country (zone 0)
const PRICE_NATURES = ["farmer_price", "matif_price", "shipping_price"]

export async function priceOf(db: Pool, production: string, department?: string) {
  const rows = await rowsOf<{
    value: string
    unit: string
    campaign: number
    specie: string
    nature: string
    zone: string
  }>(
    db,
    `SELECT avg(pr.final_price) AS value, pr.price_unit AS unit, pr.campaign, pr.specie,
       pr.nature, pr.department_zone AS zone
     FROM ${table("master_production_prices")} pr
     JOIN ${table("master_productions")} p ON p.specie = pr.specie
     WHERE p.reference_name = $1 AND pr.department_zone = ANY($2)
       AND pr.final_price > 0 AND pr.nature = ANY($3) AND pr.organic IS NOT TRUE
     GROUP BY pr.campaign, pr.price_unit, pr.specie, pr.nature, pr.department_zone
     ORDER BY pr.campaign DESC, array_position($3, pr.nature::text),
       (pr.department_zone = '0')
     LIMIT 1;`,
    [production, department ? [department, "0"] : ["0"], PRICE_NATURES],
  )
  const found = rows?.[0]

  return found
    ? {
        value: Math.round(Number(found.value) * 100) / 100,
        unit: found.unit,
        campaign: found.campaign,
        specie: found.specie,
        nature: found.nature,
        national: found.zone === "0",
      }
    : undefined
}

/**
 * What Lexicon holds about a production grown in a department: usages of plant
 * protection products, R&D documents, technical workflows, selling price.
 */
export async function cropContext(
  db: Pool,
  production: string,
  department?: string,
): Promise<CropContext> {
  const [usages, documents, workflows, price] = await Promise.all([
    usagesOf(db, production),
    documentsOf(db, production, department),
    workflowsOf(db, production),
    priceOf(db, production, department),
  ])

  return { production, usages, documents, workflows, price }
}

/**
 * The value of a hectare of crop, in euros: a yield in quintals per hectare
 * sold at a price per ton. Undefined when the units are others.
 */
export function grossProductOf(
  crop: { value: number; unit: string } | undefined,
  price: { value: number; unit: string } | undefined,
): number | undefined {
  return crop !== undefined &&
    price !== undefined &&
    crop.unit === "quintal_per_hectare" &&
    price.unit === "ton"
    ? Math.round((crop.value / 10) * price.value)
    : undefined
}
