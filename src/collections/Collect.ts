import type { Pool } from "pg"

// A collection gathers parcels, cadastral or declared to the CAP, with what the
// Lexicon knows of each. The parcels are picked by a zone (a commune, a circle
// around a point, or a list of identifiers) and the data by the datasets the
// member ticks; everything is read at once and frozen in a GeoJSON document.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

export const MAXIMUM_PARCELS = 2000
export const MAXIMUM_RADIUS_IN_METRES = 5000
export const MAXIMUM_IDENTIFIERS = MAXIMUM_PARCELS
const WATER_REACH_IN_DEGREES = 0.005
// Owners of these groups are private persons: their name is never given
const GROUPS_NAMING_PEOPLE = ["7", "8"]
const WHOLE_COMMUNES = ["75056", "69123", "13055"]

export type Kind = "cadastre" | "pac"

export const KINDS: Record<Kind, string> = {
  cadastre: "Parcelles cadastrales",
  pac: "Parcelles déclarées à la PAC (RPG)",
}

export type Zone =
  | Readonly<{ by: "commune"; inseeCode: string }>
  | Readonly<{ by: "point"; latitude: number; longitude: number; radius: number }>
  | Readonly<{ by: "identifiers"; identifiers: readonly string[] }>

export type Criteria = Readonly<{
  kind: Kind
  zone: Zone
  // Cadastral section, or part of the name of a crop: narrows the zone
  filter?: string
}>

export type Dataset = Readonly<{
  key: string
  label: string
  detail: string
  kinds: readonly Kind[]
}>

// What can be attached to each parcel. Every key adds the properties named in `detail`
export const DATASETS: readonly Dataset[] = [
  {
    key: "commune",
    label: "Commune",
    detail: "code INSEE et nom de la commune",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "culture",
    label: "Culture déclarée à la PAC",
    detail: "culture de la dernière campagne, son code et la campagne",
    kinds: ["cadastre"],
  },
  {
    key: "proprietaires",
    label: "Propriétaires (personnes morales)",
    detail: "dénomination et SIREN des sociétés et organismes propriétaires",
    kinds: ["cadastre"],
  },
  {
    key: "transactions",
    label: "Transactions foncières",
    detail: "date et prix de la dernière vente, nombre de ventes depuis 2021",
    kinds: ["cadastre"],
  },
  {
    key: "sol",
    label: "Sol",
    detail: "profondeur du sol et réserve utile",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "eau",
    label: "Eau à proximité",
    detail: "le point d'eau ou le cours d'eau le plus proche à moins de 500 m, et sa distance",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "zonages",
    label: "Zonages",
    detail: "zones naturelles protégées et zones de protection de l'eau",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "pat",
    label: "Projets alimentaires territoriaux",
    detail: "les PAT qui couvrent la commune",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "signes",
    label: "Signes de qualité et d'origine",
    detail: "aires AOC/AOP, IGP et IG de la commune, zone délimitée d'AOC viticole où se trouve la parcelle",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "bio",
    label: "Agriculture biologique",
    detail: "producteurs, exploitations et surface bio de la commune (siège des exploitations) et de son intercommunalité",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "hve",
    label: "Haute Valeur Environnementale",
    detail: "exploitations certifiées HVE de la commune, propriétaires de la parcelle certifiés",
    kinds: ["cadastre", "pac"],
  },
  {
    key: "cantines",
    label: "Restauration collective",
    detail: "cantines de la commune et part de bio de leurs achats déclarés",
    kinds: ["cadastre", "pac"],
  },
]

export const datasetsOf = (kind: Kind) =>
  DATASETS.filter((dataset) => dataset.kinds.includes(kind))

export type Feature = {
  type: "Feature"
  id?: string
  geometry: unknown
  properties: Record<string, unknown>
}

export type FeatureCollection = { type: "FeatureCollection"; features: Feature[] }

type Db = Pick<Pool, "query">

const rowsOf = <Row>(db: Db, sql: string, values: unknown[]) =>
  db.query(sql, values).then((result) => result.rows as Row[])

// --- reading what a member typed

const INSEE_CODE = /^(\d{5}|2[AB]\d{3})$/i
const CADASTRAL_ID = /^[0-9AB]{5}[0-9A-Z]{9}$/i

export function identifiersIn(typed: string): string[] {
  return [
    ...new Set(
      typed
        .split(/[\s,;]+/)
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value !== ""),
    ),
  ]
}

/**
 * The zone a form describes, or what is wrong with it.
 */
export function zoneIn(
  kind: Kind,
  fields: Record<string, string>,
): { zone: Zone } | { problem: string } {
  if (fields.by === "commune") {
    return INSEE_CODE.test(fields.commune ?? "")
      ? { zone: { by: "commune", inseeCode: fields.commune.toUpperCase() } }
      : { problem: "Choisissez une commune." }
  }

  if (fields.by === "point") {
    const latitude = Number((fields.latitude ?? "").replace(",", "."))
    const longitude = Number((fields.longitude ?? "").replace(",", "."))
    const radius = Math.round(Number(fields.radius))
    const isPlace =
      fields.latitude !== "" &&
      fields.longitude !== "" &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180

    if (!isPlace) {
      return { problem: "Donnez la latitude et la longitude du point, en degrés décimaux." }
    }

    return radius >= 10 && radius <= MAXIMUM_RADIUS_IN_METRES
      ? { zone: { by: "point", latitude, longitude, radius } }
      : { problem: `Le rayon va de 10 à ${MAXIMUM_RADIUS_IN_METRES} mètres.` }
  }

  if (fields.by === "identifiers") {
    const identifiers = identifiersIn(fields.identifiers ?? "")
    const wrong =
      kind === "cadastre" ? identifiers.filter((id) => !CADASTRAL_ID.test(id)) : []

    if (identifiers.length === 0) {
      return { problem: "Collez au moins un identifiant de parcelle." }
    }
    if (identifiers.length > MAXIMUM_IDENTIFIERS) {
      return { problem: `Pas plus de ${MAXIMUM_IDENTIFIERS} identifiants.` }
    }

    return wrong.length > 0
      ? {
          problem: `Ce ne sont pas des identifiants cadastraux (14 caractères, comme 17387000AV0659) : ${wrong.slice(0, 5).join(", ")}.`,
        }
      : { zone: { by: "identifiers", identifiers } }
  }

  return { problem: "Choisissez comment désigner les parcelles." }
}

export function describeZone(zone: Zone, communeName?: string): string {
  if (zone.by === "commune") {
    return `commune ${communeName ?? ""} (${zone.inseeCode})`.replace("  ", " ")
  }
  if (zone.by === "point") {
    return `à ${zone.radius} m autour de ${zone.latitude.toFixed(5)}, ${zone.longitude.toFixed(5)}`
  }

  return `${zone.identifiers.length} identifiant${zone.identifiers.length > 1 ? "s" : ""}`
}

// --- communes

export type Commune = Readonly<{ code: string; name: string; postalCodes: string }>

/**
 * The communes a member may mean by a code, a postal code or the start of a name.
 */
export async function communesMatching(db: Db, typed: string): Promise<Commune[]> {
  const asked = typed.trim()

  if (asked.length < 2) {
    return []
  }

  const isCode = /^[0-9AB]{5}$/i.test(asked)

  return rowsOf<Commune>(
    db,
    `SELECT code, min(city_name) AS name, string_agg(DISTINCT postal_code, ', ') AS "postalCodes"
       FROM ${table("registered_postal_codes")}
      WHERE ${isCode ? "(code = upper($1) OR postal_code = $1)" : "city_name ILIKE $1 || '%'"}
      GROUP BY code ORDER BY min(city_name), code LIMIT 30;`,
    [isCode ? asked : asked.toUpperCase().replace(/[-']/g, " ").replace(/^SAINT(E?) /, "ST$1 ")],
  )
}

export async function communeName(db: Db, inseeCode: string): Promise<string | undefined> {
  const rows = await rowsOf<{ name: string }>(
    db,
    `SELECT city_name AS name FROM ${table("registered_postal_codes")} WHERE code = $1 LIMIT 1;`,
    [inseeCode],
  )

  return rows[0]?.name
}

// --- picking the parcels

const PARCELS: Record<Kind, string> = {
  cadastre: "registered_cadastral_parcels",
  pac: "registered_graphic_parcels",
}

function selection(criteria: Criteria): { where: string; values: unknown[] } {
  const { kind, zone } = criteria
  const filter = (criteria.filter ?? "").trim()
  const narrowed = (where: string, values: unknown[]) => {
    if (filter === "") {
      return { where, values }
    }

    return kind === "cadastre"
      ? { where: `${where} AND p.section = upper($${values.length + 1})`, values: [...values, filter] }
      : {
          where: `${where} AND (p.cap_crop_code = upper($${values.length + 1}) OR p.cap_crop_code IN (
            SELECT cap_code FROM ${table("master_crop_production_cap_codes")} WHERE cap_label ILIKE '%' || $${values.length + 1} || '%'))`,
          values: [...values, filter],
        }
  }

  if (zone.by === "identifiers") {
    return narrowed("p.id = ANY($1::varchar[])", [zone.identifiers])
  }

  if (zone.by === "point") {
    return narrowed(
      `postgis.ST_Intersects(p.shape, postgis.ST_Transform(postgis.ST_Buffer(
         postgis.ST_Transform(postgis.ST_SetSRID(postgis.ST_MakePoint($1, $2), 4326), 2154), $3), 4326))`,
      [zone.longitude, zone.latitude, zone.radius],
    )
  }

  return kind === "cadastre"
    ? narrowed("p.town_insee_code = $1", [zone.inseeCode])
    : narrowed(
        `postgis.ST_Contains((SELECT city_shape FROM ${table("registered_postal_codes")}
           WHERE code = $1 AND city_shape IS NOT NULL LIMIT 1), p.centroid)`,
        [zone.inseeCode],
      )
}

/**
 * How many parcels the criteria pick, counted up to one past the ceiling.
 */
export async function countParcels(db: Db, criteria: Criteria): Promise<number> {
  const { where, values } = selection(criteria)
  const rows = await rowsOf<{ count: number }>(
    db,
    `SELECT count(*)::integer AS count FROM (
       SELECT 1 FROM ${table(PARCELS[criteria.kind])} AS p WHERE ${where} LIMIT ${MAXIMUM_PARCELS + 1}) AS picked;`,
    values,
  )

  return rows[0]?.count ?? 0
}

/**
 * The cadastral sections of a commune and how many parcels each holds: what a
 * member narrows by when the commune holds more parcels than a collection can.
 */
export async function sectionsOf(db: Db, inseeCode: string) {
  return rowsOf<{ section: string; parcels: number }>(
    db,
    `SELECT section, count(*)::integer AS parcels FROM ${table("registered_cadastral_parcels")}
      WHERE town_insee_code = $1 GROUP BY section ORDER BY section;`,
    [inseeCode],
  )
}

// --- reading the parcels and what is known of each

type Properties = Map<string, Record<string, unknown>>

const round = (value: unknown, digits = 0) =>
  value === null || value === undefined
    ? undefined
    : Math.round(Number(value) * 10 ** digits) / 10 ** digits

async function base(db: Db, kind: Kind, ids: string[]) {
  const shape = `postgis.ST_AsGeoJSON(p.shape, 6)::json AS geometry`

  return kind === "cadastre"
    ? rowsOf<Record<string, any>>(
        db,
        `SELECT p.id, p.town_insee_code AS commune_code, p.section_prefix, p.section, p.work_number,
                p.net_surface_area, ${shape}
           FROM ${table("registered_cadastral_parcels")} AS p WHERE p.id = ANY($1::varchar[]) ORDER BY p.id;`,
        [ids],
      )
    : rowsOf<Record<string, any>>(
        db,
        `SELECT p.id, p.campaign, p.cap_crop_code,
                (SELECT cap_label FROM ${table("master_crop_production_cap_codes")}
                  WHERE cap_code = p.cap_crop_code ORDER BY is_seed, year DESC LIMIT 1) AS crop,
                round((postgis.ST_Area(postgis.ST_Transform(p.shape, 2154)) / 10000)::numeric, 2) AS hectares,
                (SELECT c.code FROM ${table("registered_postal_codes")} AS c
                  WHERE postgis.ST_Contains(c.city_shape, p.centroid)
                  ORDER BY c.code = ANY($2::varchar[]) LIMIT 1) AS commune_code,
                ${shape}
           FROM ${table("registered_graphic_parcels")} AS p WHERE p.id = ANY($1::varchar[]) ORDER BY p.id;`,
        [ids, WHOLE_COMMUNES],
      )
}

type Reader = (db: Db, source: string, ids: string[], communes: string[]) => Promise<Properties>

// The name of a watercourse comes by language: {"fra": "le Bruant"}
function nameOf(name: string | null): string | undefined {
  try {
    const read = name === null ? undefined : JSON.parse(name)

    return typeof read === "string" ? read : (read?.fra ?? Object.values(read ?? {})[0])
  } catch {
    return name ?? undefined
  }
}

const byId = (rows: Record<string, any>[], properties: (row: any) => Record<string, unknown>) =>
  new Map(rows.map((row) => [String(row.id), properties(row)]))

const READERS: Record<string, Reader> = {
  culture: async (db, source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT p.id, g.cap_crop_code, g.campaign,
                (SELECT cap_label FROM ${table("master_crop_production_cap_codes")}
                  WHERE cap_code = g.cap_crop_code ORDER BY is_seed, year DESC LIMIT 1) AS crop
           FROM ${table(source)} AS p
           JOIN LATERAL (SELECT cap_crop_code, campaign FROM ${table("registered_graphic_parcels")}
                          WHERE postgis.ST_Contains(shape, p.centroid) LIMIT 1) AS g ON true
          WHERE p.id = ANY($1::varchar[]);`,
        [ids],
      ),
      (row) => ({ culture: row.crop ?? row.cap_crop_code, code_culture: row.cap_crop_code, campagne: row.campaign }),
    ),

  proprietaires: async (db, _source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT o.cadastral_parcel_id AS id,
                string_agg(DISTINCT c.denomination, ' ; ') FILTER (WHERE c.denomination IS NOT NULL) AS names,
                string_agg(DISTINCT c.siren, ' ; ') FILTER (WHERE c.siren IS NOT NULL) AS sirens
           FROM ${table("registered_cadastral_parcel_owners")} AS o
           JOIN ${table("registered_cadastral_owners")} AS c
             ON c.majic_number = o.majic_number AND c.department_code = o.department_code
          WHERE o.cadastral_parcel_id = ANY($1::varchar[])
            AND (c.siren IS NOT NULL OR (c.person_group_code IS NOT NULL AND left(c.person_group_code, 1) <> ALL($2::varchar[])))
          GROUP BY o.cadastral_parcel_id;`,
        [ids, GROUPS_NAMING_PEOPLE],
      ),
      (row) => ({ proprietaires: row.names ?? undefined, siren_proprietaires: row.sirens ?? undefined }),
    ),

  transactions: async (db, _source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT cadastral_parcel_id AS id, count(DISTINCT mutation_id)::integer AS sales,
                max(mutation_date)::text AS last_sale,
                (array_agg(cadastral_price ORDER BY mutation_date DESC))[1] AS last_price
           FROM ${table("registered_cadastral_prices")}
          WHERE cadastral_parcel_id = ANY($1::varchar[]) GROUP BY cadastral_parcel_id;`,
        [ids],
      ),
      (row) => ({
        ventes: row.sales,
        derniere_vente: row.last_sale,
        prix_derniere_vente_eur: round(row.last_price),
      }),
    ),

  sol: async (db, source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT p.id, s.soil_depth_value, s.soil_depth_unit, a.available_water_label, a.available_water_reference_value
           FROM ${table(source)} AS p
           LEFT JOIN LATERAL (SELECT soil_depth_value, soil_depth_unit FROM ${table("registered_soil_depths")}
                               WHERE postgis.ST_Contains(shape, p.centroid) LIMIT 1) AS s ON true
           LEFT JOIN LATERAL (SELECT available_water_label, available_water_reference_value
                                FROM ${table("registered_soil_available_water_capacities")}
                               WHERE postgis.ST_Contains(shape, p.centroid) LIMIT 1) AS a ON true
          WHERE p.id = ANY($1::varchar[]);`,
        [ids],
      ),
      (row) => ({
        [row.soil_depth_unit === "centimeter" ? "profondeur_sol_cm" : "profondeur_sol"]: round(
          row.soil_depth_value,
          1,
        ),
        reserve_utile: row.available_water_label ?? undefined,
        reserve_utile_mm: round(row.available_water_reference_value),
      }),
    ),

  eau: async (db, source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT p.id, w.nature, w.name, round(w.distance) AS distance
           FROM ${table(source)} AS p
           JOIN LATERAL (
             SELECT h.nature, h.name::text AS name,
                    postgis.ST_Distance(postgis.ST_Transform(COALESCE(h.lines, h.shape, h.point), 2154),
                                        postgis.ST_Transform(p.shape, 2154)) AS distance
               FROM ${table("registered_hydrographic_items")} AS h
              WHERE (postgis.ST_DWithin(h.lines, p.shape, ${WATER_REACH_IN_DEGREES})
                  OR postgis.ST_DWithin(h.shape, p.shape, ${WATER_REACH_IN_DEGREES})
                  OR postgis.ST_DWithin(h.point, p.shape, ${WATER_REACH_IN_DEGREES}))
                AND h.nature <> 'watercourse'
              ORDER BY distance LIMIT 1) AS w ON w.distance <= 500
          WHERE p.id = ANY($1::varchar[]);`,
        [ids],
      ),
      (row) => ({
        eau_proche: [row.nature, nameOf(row.name)].filter(Boolean).join(" : "),
        distance_eau_m: round(row.distance),
      }),
    ),

  zonages: async (db, source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT p.id,
                (SELECT string_agg(DISTINCT z.name, ' ; ') FROM ${table("registered_natural_zones")} AS z
                  WHERE postgis.ST_Contains(z.shape, p.centroid)) AS natural_zones,
                (SELECT string_agg(DISTINCT z.name, ' ; ') FROM ${table("registered_protected_water_zones")} AS z
                  WHERE postgis.ST_Contains(z.shape, p.centroid)) AS water_zones
           FROM ${table(source)} AS p WHERE p.id = ANY($1::varchar[]);`,
        [ids],
      ),
      (row) => ({
        zones_naturelles: row.natural_zones ?? undefined,
        zones_protection_eau: row.water_zones ?? undefined,
      }),
    ),

  // The zones delimited for wines under AOC that hold the centre of the parcel
  signes: async (db, source, ids) =>
    byId(
      await rowsOf(
        db,
        `SELECT p.id,
                (SELECT string_agg(DISTINCT z.appellation, ' ; ') FROM ${table("registered_quality_and_origin_sign_zones")} AS z
                  WHERE postgis.ST_Intersects(z.shape, p.centroid)) AS zones
           FROM ${table(source)} AS p WHERE p.id = ANY($1::varchar[]);`,
        [ids],
      ),
      (row) => ({ zone_aoc_viticole: row.zones ?? undefined }),
    ),

  // Owners of a cadastral parcel that are in the HVE directory
  hve: async (db, source, ids) =>
    source !== PARCELS.cadastre
      ? new Map()
      : byId(
          await rowsOf(
            db,
            `SELECT o.cadastral_parcel_id AS id, string_agg(DISTINCT f.name, ' ; ') AS farms
               FROM ${table("registered_cadastral_parcel_owners")} AS o
               JOIN ${table("registered_hve_farms")} AS f ON f.siren = o.siren
              WHERE o.cadastral_parcel_id = ANY($1::varchar[]) AND o.siren IS NOT NULL
              GROUP BY 1;`,
            [ids],
          ),
          (row) => ({ proprietaire_hve: row.farms ?? undefined }),
        ),
}

type CommuneReader = (db: Db, codes: string[]) => Promise<Properties>

const byCode = (rows: Record<string, any>[], properties: (row: any) => Record<string, unknown>) =>
  new Map(rows.map((row) => [String(row.code), properties(row)]))

// What is said of the commune of a parcel, the same for every parcel of it
const COMMUNE_READERS: Record<string, CommuneReader> = {
  signes: async (db, codes) =>
    byCode(
      await rowsOf(
        db,
        `SELECT c.insee_code AS code,
                string_agg(btrim(a.name), ' ; ' ORDER BY a.name) FILTER (WHERE c.sign = 'AOC') AS aoc,
                string_agg(btrim(a.name), ' ; ' ORDER BY a.name) FILTER (WHERE c.sign = 'IGP') AS igp,
                string_agg(btrim(a.name), ' ; ' ORDER BY a.name) FILTER (WHERE c.sign = 'IG') AS ig
           FROM ${table("registered_quality_and_origin_sign_communes")} AS c
           JOIN ${table("registered_quality_and_origin_sign_areas")} AS a ON a.id = c.area_id
          WHERE c.insee_code = ANY($1::varchar[]) GROUP BY 1;`,
        [codes],
      ),
      (row) => ({ aoc_aop: row.aoc ?? undefined, igp: row.igp ?? undefined, ig: row.ig ?? undefined }),
    ),

  // Figures of the farms seated in the commune; the area is absent under statistical secrecy
  bio: async (db, codes) =>
    byCode(
      await rowsOf(
        db,
        `WITH latest AS (SELECT max(year) AS year FROM ${table("registered_organic_areas")})
         SELECT c.insee_code AS code, latest.year,
                (SELECT sum(operators_count) FROM ${table("registered_organic_operators")} AS o
                  WHERE o.insee_code = c.insee_code AND o.year = latest.year AND o.kind = 'P') AS producers,
                a.farms_count, a.organic_area, e.epci_name, e.organic_area AS epci_area
           FROM ${table("registered_organic_communes")} AS c
           CROSS JOIN latest
           LEFT JOIN ${table("registered_organic_areas")} AS a ON a.insee_code = c.insee_code AND a.year = latest.year
           LEFT JOIN ${table("registered_organic_epci_areas")} AS e ON e.epci_code = c.epci_code AND e.year = latest.year
          WHERE c.insee_code = ANY($1::varchar[]);`,
        [codes],
      ),
      (row) => ({
        bio_annee: row.year,
        bio_producteurs: row.producers === null ? 0 : Number(row.producers),
        bio_exploitations: row.farms_count ?? 0,
        bio_surface_ha: row.organic_area === null ? undefined : round(row.organic_area, 1),
        bio_intercommunalite: row.epci_name ?? undefined,
        bio_surface_intercommunalite_ha: row.epci_area === null ? undefined : round(row.epci_area, 1),
      }),
    ),

  hve: async (db, codes) =>
    byCode(
      await rowsOf(
        db,
        `SELECT insee_code AS code, count(*) AS farms FROM ${table("registered_hve_farms")}
          WHERE insee_code = ANY($1::varchar[]) GROUP BY 1;`,
        [codes],
      ),
      (row) => ({ hve_exploitations_commune: Number(row.farms) }),
    ),

  cantines: async (db, codes) =>
    byCode(
      await rowsOf(
        db,
        `SELECT r.code, r.canteens, d.year, d.declarations_count, d.weighted_organic_share, d.meeting_targets_count
           FROM (SELECT insee_code AS code, count(*) AS canteens FROM ${table("registered_canteens")}
                  WHERE insee_code = ANY($1::varchar[]) GROUP BY 1) AS r
           LEFT JOIN LATERAL (SELECT * FROM ${table("registered_canteen_communes")} AS c
                               WHERE c.insee_code = r.code ORDER BY c.year DESC LIMIT 1) AS d ON true;`,
        [codes],
      ),
      (row) => ({
        cantines_inscrites: Number(row.canteens),
        cantines_annee_declaration: row.year ?? undefined,
        cantines_declarantes: row.declarations_count ?? undefined,
        cantines_part_bio_pct:
          row.weighted_organic_share === null || row.weighted_organic_share === undefined
            ? undefined
            : round(Number(row.weighted_organic_share) * 100, 1),
        cantines_aux_objectifs_egalim: row.meeting_targets_count ?? undefined,
      }),
    ),
}

/**
 * What is known of the communes of the parcels: their name, and the food
 * projects that cover them.
 */
async function communesOf(db: Db, codes: string[], withProjects: boolean) {
  const names = await rowsOf<{ code: string; name: string }>(
    db,
    `SELECT code, min(city_name) AS name FROM ${table("registered_postal_codes")}
      WHERE code = ANY($1::varchar[]) GROUP BY code;`,
    [codes],
  )
  const projects = withProjects
    ? await rowsOf<{ code: string; names: string }>(
        db,
        `SELECT c.insee_code AS code, string_agg(DISTINCT f.name, ' ; ') AS names
           FROM ${table("registered_territorial_food_project_communes")} AS c
           JOIN ${table("registered_territorial_food_projects")} AS f ON f.id = c.project_id
          WHERE c.insee_code = ANY($1::varchar[]) GROUP BY c.insee_code;`,
        [codes],
      ).catch(() => [])
    : []

  return {
    names: new Map(names.map((row) => [row.code, row.name])),
    projects: new Map(projects.map((row) => [row.code, row.names])),
  }
}

const withoutEmpty = (properties: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(properties).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  )

/**
 * Reads the parcels the criteria pick, with the datasets asked for.
 * @returns undefined when the criteria pick more parcels than a collection holds
 */
export async function collect(
  db: Db,
  criteria: Criteria,
  datasets: readonly string[],
): Promise<FeatureCollection | undefined> {
  const { where, values } = selection(criteria)
  const source = PARCELS[criteria.kind]
  const picked = await rowsOf<{ id: string }>(
    db,
    `SELECT p.id FROM ${table(source)} AS p WHERE ${where} ORDER BY p.id LIMIT ${MAXIMUM_PARCELS + 1};`,
    values,
  )

  if (picked.length > MAXIMUM_PARCELS) {
    return undefined
  }

  const ids = picked.map((row) => row.id)
  const asked = datasetsOf(criteria.kind)
    .map((dataset) => dataset.key)
    .filter((key) => datasets.includes(key))
  const parcels = ids.length === 0 ? [] : await base(db, criteria.kind, ids)
  const communeCodes = [
    ...new Set(parcels.map((parcel) => parcel.commune_code).filter(Boolean)),
  ] as string[]
  const communes = await communesOf(db, communeCodes, asked.includes("pat"))
  // A dataset that is not in service leaves its properties out, and the others in
  const read = await Promise.all(
    asked
      .filter((key) => READERS[key] !== undefined)
      .map((key) =>
        READERS[key](db, source, ids, communeCodes).catch(() => new Map() as Properties),
      ),
  )

  const aboutCommunes =
    communeCodes.length === 0
      ? []
      : await Promise.all(
          asked
            .filter((key) => COMMUNE_READERS[key] !== undefined)
            .map((key) => COMMUNE_READERS[key](db, communeCodes).catch(() => new Map() as Properties)),
        )

  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => {
      const id = String(parcel.id)
      const own =
        criteria.kind === "cadastre"
          ? {
              identifiant: id,
              prefixe: parcel.section_prefix,
              section: parcel.section,
              numero: parcel.work_number,
              surface_m2: parcel.net_surface_area,
            }
          : {
              identifiant: id,
              culture: parcel.crop ?? parcel.cap_crop_code,
              code_culture: parcel.cap_crop_code,
              campagne: parcel.campaign,
              surface_ha: round(parcel.hectares, 2),
            }
      const commune = asked.includes("commune")
        ? {
            code_insee: parcel.commune_code,
            commune: communes.names.get(parcel.commune_code),
          }
        : {}
      const projects = asked.includes("pat")
        ? { pat: communes.projects.get(parcel.commune_code) }
        : {}

      return {
        type: "Feature" as const,
        id,
        geometry: parcel.geometry,
        properties: withoutEmpty(
          Object.assign(
            {},
            own,
            commune,
            ...read.map((found) => found.get(id) ?? {}),
            projects,
            ...aboutCommunes.map((found) => found.get(parcel.commune_code) ?? {}),
          ),
        ),
      }
    }),
  }
}

// --- what comes back from the editor

export const MAXIMUM_FEATURES = 5000
export const MAXIMUM_DOCUMENT_BYTES = 20 * 1024 * 1024

/**
 * Whether a document is a GeoJSON collection a member may keep.
 * @returns the collection, or what is wrong with the document
 */
export function featureCollectionIn(
  document: unknown,
): { collection: FeatureCollection } | { problem: string } {
  const candidate = document as { type?: unknown; features?: unknown }

  if (candidate?.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    return { problem: "Le document n'est pas une collection GeoJSON (FeatureCollection)." }
  }
  if (candidate.features.length > MAXIMUM_FEATURES) {
    return { problem: `Une collecte garde au plus ${MAXIMUM_FEATURES} objets.` }
  }

  const isFeature = (feature: any) =>
    feature?.type === "Feature" &&
    (feature.geometry === null || typeof feature.geometry?.type === "string") &&
    (feature.properties === null || typeof feature.properties === "object")

  return candidate.features.every(isFeature)
    ? {
        collection: {
          type: "FeatureCollection",
          features: candidate.features.map((feature: any) => ({
            type: "Feature",
            ...(feature.id === undefined ? {} : { id: feature.id }),
            geometry: feature.geometry,
            properties: feature.properties ?? {},
          })),
        },
      }
    : { problem: "Un objet du document n'est pas un objet GeoJSON (Feature)." }
}

/**
 * The properties of the features as a table, one column per property met.
 */
export function csvOf(collection: FeatureCollection): string {
  const columns = [
    ...new Set(collection.features.flatMap((feature) => Object.keys(feature.properties ?? {}))),
  ]
  const cell = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value)

    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  return (
    [columns, ...collection.features.map((feature) => columns.map((column) => feature.properties?.[column]))]
      .map((line) => line.map(cell).join(","))
      .join("\n") + "\n"
  )
}
