import type { Pool } from "pg"

// What a commune is, as to farming and food: the quality signs whose area covers
// it (INAO), its organic farming (Agence Bio), its farms certified HVE, what its
// canteens declare of their purchases (ma cantine) and where farming is taught
// near it (RefEA). Each part is absent when its package is not in service.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

type Db = Pick<Pool, "query">

const rowsOf = <Row>(db: Db, sql: string, values: unknown[]) =>
  db
    .query(sql, values)
    .then((result) => result.rows as Row[])
    .catch(() => undefined)

const number = (value: unknown) => (value === null || value === undefined ? undefined : Number(value))

const rounded = (value: unknown, digits = 1) => {
  if (value === null || value === undefined) {
    return undefined
  }

  const factor = 10 ** digits

  return Math.round(Number(value) * factor) / factor
}

// A share kept as a ratio by the source, given in percent
const percent = (value: unknown) =>
  value === null || value === undefined ? undefined : rounded(Number(value) * 100)

export const QUALITY_SIGNS_CAVEAT =
  "For information: the specification of a product alone says where it may be made. Source: INAO, lists of communes of October 2025, Licence Ouverte."
export const ORGANIC_CAVEAT =
  "Areas and livestock of fewer than three farms are kept secret in a commune. Every parcel of a farm is counted in the commune of its seat. Source: Agence Bio, Licence Ouverte."
export const HVE_CAVEAT =
  "Only the farms that agreed to be listed: a minimum, not a count. Source: ministry of agriculture, Licence Ouverte."
export const CANTEENS_CAVEAT =
  "Only the canteens that declared: a commune without a declaration is not a commune without a canteen. A central kitchen declares in the commune where it cooks. Shares of the food purchases, in value. Source: ma cantine, Licence Ouverte."
export const SCHOOLS_CAVEAT =
  "A school is placed in its commune, not at its address. Source: RefEA, ministry of agriculture, Licence Ouverte."

// --- quality signs

export const SIGN_FAMILIES = [
  "wine",
  "spirits",
  "cheese",
  "meat",
  "fruits_and_vegetables",
  "seafood",
  "other",
]

export type QualityArea = Readonly<{
  id: number
  name: string
  // AOC, IGP or IG
  sign: string
  family: string
  // Known through communes the commune absorbed only
  partial: boolean
  "former-communes"?: string[]
  products: string[]
}>

export type QualitySigns = Readonly<{
  areas: QualityArea[]
  // Areas of each sign: { AOC: 4, IGP: 12 }
  count: Record<string, number>
  caveat: string
}>

type AreaRow = {
  id: number
  name: string
  sign: string
  family: string
  partial: boolean
  former_communes: string[]
  products: string[]
}

export async function qualitySignsOf(db: Db, inseeCode: string): Promise<QualitySigns | undefined> {
  const rows = await rowsOf<AreaRow>(
    db,
    `SELECT a.id, a.name, a.sign, a.family, c.partial, c.former_communes,
       ARRAY(SELECT DISTINCT btrim(p.product_human_name_fra) FROM ${table("registered_quality_and_origin_signs")} p
              WHERE p.ida = a.id ORDER BY 1) AS products
     FROM ${table("registered_quality_and_origin_sign_communes")} c
     JOIN ${table("registered_quality_and_origin_sign_areas")} a ON a.id = c.area_id
     WHERE c.insee_code = $1
     ORDER BY array_position($2::text[], a.family), a.sign, a.name;`,
    [inseeCode, SIGN_FAMILIES],
  )

  if (rows === undefined) {
    return undefined
  }

  const count: Record<string, number> = {}

  for (const row of rows) {
    count[row.sign] = (count[row.sign] ?? 0) + 1
  }

  return {
    areas: rows.map((row) => ({
      id: row.id,
      name: row.name.trim(),
      sign: row.sign,
      family: row.family,
      partial: row.partial,
      "former-communes": row.former_communes.length > 0 ? row.former_communes : undefined,
      products: row.products,
    })),
    count,
    caveat: QUALITY_SIGNS_CAVEAT,
  }
}

export type QualityZone = Readonly<{
  appellation: string
  // The geographical denomination inside the appellation, when the zone is one
  denomination?: string
  categories?: string
}>

/**
 * The zones delimited for wines under AOC that hold a point. An empty list when
 * none does: the commune may still be in the area of the appellation.
 */
export async function qualityZonesAt(
  db: Db,
  point: { longitude: number; latitude: number },
): Promise<QualityZone[] | undefined> {
  const rows = await rowsOf<{
    appellation: string
    denomination: string | null
    complementary: boolean
    categories: string | null
  }>(
    db,
    `SELECT DISTINCT z.appellation, z.denomination, z.complementary, z.categories
     FROM ${table("registered_quality_and_origin_sign_zones")} z
     WHERE postgis.ST_Intersects(z.shape, postgis.ST_SetSRID(postgis.ST_MakePoint($1, $2), 4326))
     ORDER BY z.appellation, z.complementary, z.denomination;`,
    [point.longitude, point.latitude],
  )

  return rows?.map((row) => ({
    appellation: row.appellation,
    denomination: row.complementary && row.denomination ? row.denomination : undefined,
    categories: row.categories ?? undefined,
  }))
}

// --- organic farming

export type OrganicYear = Readonly<{
  year: number
  farms: number
  // Hectares; absent when fewer than three farms make the figure secret
  area?: number
  "conversion-area"?: number
  masked: boolean
}>

export type Organic = Readonly<{
  "insee-code": string
  // The last year the source covers, whether or not the commune has a line for it
  year: number
  // Operators of that year by kind: producers, processors, distributors, importers
  operators: { producers: number; processors: number; distributors: number; importers: number }
  // What producers mainly grow or raise, the most common first
  "main-productions": { production: string; operators: number }[]
  years: OrganicYear[]
  livestock: { group: string; production: string; farms: number; heads?: number; masked: boolean }[]
  // The intercommunality, where almost nothing is secret
  epci?: {
    code: string
    name: string
    year: number
    farms: number
    area?: number
    "conversion-area"?: number
    livestock: { group: string; production: string; farms: number; heads?: number }[]
  }
  caveat: string
}>

const KINDS: Record<string, keyof Organic["operators"]> = {
  P: "producers",
  T: "processors",
  D: "distributors",
  I: "importers",
}
const YEARS_SHOWN = 6

export async function organicOf(db: Db, inseeCode: string): Promise<Organic | undefined> {
  const latest = await rowsOf<{ year: number | null }>(
    db,
    `SELECT max(year) AS year FROM ${table("registered_organic_areas")};`,
    [],
  )
  const year = latest?.[0]?.year

  if (!year) {
    return undefined
  }

  const [operators, productions, years, livestock, epci] = await Promise.all([
    rowsOf<{ kind: string; operators: string }>(
      db,
      `SELECT kind, sum(operators_count) AS operators FROM ${table("registered_organic_operators")}
       WHERE insee_code = $1 AND year = $2 GROUP BY kind;`,
      [inseeCode, year],
    ),
    rowsOf<{ production: string; operators: string }>(
      db,
      `SELECT main_production AS production, sum(operators_count) AS operators
       FROM ${table("registered_organic_operators")}
       WHERE insee_code = $1 AND year = $2 AND kind = 'P'
       GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6;`,
      [inseeCode, year],
    ),
    rowsOf<{ year: number; farms_count: number; masked: boolean; organic_area: string | null; conversion_area: string | null }>(
      db,
      `SELECT year, farms_count, masked, organic_area, conversion_area FROM ${table("registered_organic_areas")}
       WHERE insee_code = $1 AND year > $2 ORDER BY year;`,
      [inseeCode, year - YEARS_SHOWN],
    ),
    rowsOf<{ group_name: string; production: string; farms_count: number; masked: boolean; organic_heads: number | null }>(
      db,
      `SELECT group_name, production, farms_count, masked, organic_heads FROM ${table("registered_organic_livestock")}
       WHERE insee_code = $1 AND year = $2 ORDER BY farms_count DESC, production;`,
      [inseeCode, year],
    ),
    rowsOf<{ epci_code: string; epci_name: string; year: number; farms_count: number; organic_area: string | null; conversion_area: string | null }>(
      db,
      `SELECT a.epci_code, a.epci_name, a.year, a.farms_count, a.organic_area, a.conversion_area
       FROM ${table("registered_organic_communes")} c
       JOIN ${table("registered_organic_epci_areas")} a ON a.epci_code = c.epci_code
       WHERE c.insee_code = $1 ORDER BY a.year DESC LIMIT 1;`,
      [inseeCode],
    ),
  ])

  if (!operators || !productions || !years || !livestock) {
    return undefined
  }

  const counted = { producers: 0, processors: 0, distributors: 0, importers: 0 }

  for (const row of operators) {
    const kind = KINDS[row.kind]

    if (kind) {
      counted[kind] += Number(row.operators)
    }
  }

  const around = epci?.[0]
  const herds = around
    ? await rowsOf<{ group_name: string; production: string; farms_count: number; organic_heads: number | null }>(
        db,
        `SELECT group_name, production, farms_count, organic_heads FROM ${table("registered_organic_epci_livestock")}
         WHERE epci_code = $1 AND year = $2 ORDER BY farms_count DESC, production LIMIT 8;`,
        [around.epci_code, around.year],
      )
    : undefined

  return {
    "insee-code": inseeCode,
    year,
    operators: counted,
    "main-productions": productions.map((row) => ({
      production: row.production,
      operators: Number(row.operators),
    })),
    years: years.map((row) => ({
      year: row.year,
      farms: row.farms_count,
      area: rounded(row.organic_area),
      "conversion-area": rounded(row.conversion_area),
      masked: row.masked,
    })),
    livestock: livestock.map((row) => ({
      group: row.group_name,
      production: row.production,
      farms: row.farms_count,
      heads: number(row.organic_heads),
      masked: row.masked,
    })),
    epci: around
      ? {
          code: around.epci_code,
          name: around.epci_name,
          year: around.year,
          farms: around.farms_count,
          area: rounded(around.organic_area),
          "conversion-area": rounded(around.conversion_area),
          livestock: (herds ?? []).map((row) => ({
            group: row.group_name,
            production: row.production,
            farms: row.farms_count,
            heads: number(row.organic_heads),
          })),
        }
      : undefined,
    caveat: ORGANIC_CAVEAT,
  }
}

// --- farms certified HVE

export type HveFarm = Readonly<{
  name: string
  siret?: string
  siren?: string
  "animal-activity"?: string
  "plant-activity"?: string
  "direct-sales"?: boolean
  "certified-on"?: string
  website?: string
}>

export type Hve = Readonly<{
  // Farms of the directory seated in the commune
  farms: number
  // The directory itself, for the holders of a key
  list?: HveFarm[]
  caveat: string
}>

type FarmRow = {
  name: string
  siret: string | null
  siren: string | null
  animal_activity: string | null
  plant_activity: string | null
  direct_sales: boolean | null
  certified_on: string | null
  website: string | null
}

const FARM_COLUMNS =
  "name, siret, siren, animal_activity, plant_activity, direct_sales, to_char(certified_on, 'YYYY-MM-DD') AS certified_on, website"

const farmOf = (row: FarmRow): HveFarm => ({
  name: row.name,
  siret: row.siret ?? undefined,
  siren: row.siren ?? undefined,
  "animal-activity": row.animal_activity ?? undefined,
  "plant-activity": row.plant_activity ?? undefined,
  "direct-sales": row.direct_sales ?? undefined,
  "certified-on": row.certified_on ?? undefined,
  website: row.website ?? undefined,
})

/**
 * The count is open; who the farms are is for the holders of a key, many of them
 * bearing the name of a person.
 */
export async function hveOf(db: Db, inseeCode: string, member: boolean): Promise<Hve | undefined> {
  const rows = await rowsOf<FarmRow>(
    db,
    `SELECT ${FARM_COLUMNS} FROM ${table("registered_hve_farms")} WHERE insee_code = $1 ORDER BY name;`,
    [inseeCode],
  )

  return rows === undefined
    ? undefined
    : { farms: rows.length, list: member ? rows.map(farmOf) : undefined, caveat: HVE_CAVEAT }
}

/**
 * The farms of the directory among companies, by SIREN: an owner or a farmer of
 * a parcel that is certified.
 */
export async function hveBySiren(db: Db, sirens: string[]): Promise<Map<string, HveFarm>> {
  const wanted = [...new Set(sirens.filter((siren) => /^\d{9}$/.test(siren)))]

  if (wanted.length === 0) {
    return new Map()
  }

  const rows = await rowsOf<FarmRow>(
    db,
    `SELECT DISTINCT ON (siren) ${FARM_COLUMNS} FROM ${table("registered_hve_farms")}
     WHERE siren = ANY($1) ORDER BY siren, certified_on DESC;`,
    [wanted],
  )

  return new Map((rows ?? []).map((row) => [row.siren as string, farmOf(row)]))
}

// --- canteens

export type CanteenYear = Readonly<{
  year: number
  declarations: number
  // Declarations made by a central kitchen for the restaurants it delivers
  "central-kitchens": number
  // Canteens buying at least 20 % organic and 50 % under a quality sign, organic included
  "meeting-targets": number
  // Percent of the food purchases, in value
  "median-organic-share"?: number
  "lowest-organic-share"?: number
  "highest-organic-share"?: number
  "median-quality-share"?: number
  // Weighted by the meals a year of the canteens whose meals are known
  "weighted-organic-share"?: number
  "weighted-quality-share"?: number
  "weighted-declarations": number
}>

export type CanteenDeclaration = Readonly<{
  name: string
  sectors: string[]
  central: boolean
  "organic-share"?: number
  // Bought under another quality sign than organic
  "quality-share"?: number
  "meets-targets"?: boolean
  "yearly-meals"?: number
}>

export type Canteens = Readonly<{
  // Canteens of the national register in the commune, and the meals they serve a day
  registered: number
  "daily-meals"?: number
  years: CanteenYear[]
  // What each canteen declared for the last year the commune has a declaration for
  latest?: { year: number; declarations: CanteenDeclaration[] }
  targets: { organic: number; quality: number }
  caveat: string
}>

export const CANTEEN_TARGETS = { organic: 20, quality: 50 }

export async function canteensOf(db: Db, inseeCode: string): Promise<Canteens | undefined> {
  const [register, years] = await Promise.all([
    rowsOf<{ canteens: string; meals: string | null }>(
      db,
      `SELECT count(*) AS canteens, sum(daily_meals) AS meals FROM ${table("registered_canteens")} WHERE insee_code = $1;`,
      [inseeCode],
    ),
    rowsOf<Record<string, string | number | null>>(
      db,
      `SELECT * FROM ${table("registered_canteen_communes")} WHERE insee_code = $1 ORDER BY year;`,
      [inseeCode],
    ),
  ])

  if (!register || !years) {
    return undefined
  }

  const last = years.length > 0 ? Number(years[years.length - 1].year) : undefined
  const declarations = last
    ? await rowsOf<{
        name: string | null
        sectors: string[]
        central: boolean
        organic_share: string | null
        quality_share: string | null
        meets_targets: boolean | null
        yearly_meals: number | null
      }>(
        db,
        `SELECT name, sectors, central, organic_share, quality_share, meets_targets, yearly_meals
         FROM ${table("registered_canteen_declarations")}
         WHERE insee_code = $1 AND year = $2 ORDER BY yearly_meals DESC NULLS LAST, name;`,
        [inseeCode, last],
      )
    : undefined

  return {
    registered: Number(register[0]?.canteens ?? 0),
    "daily-meals": number(register[0]?.meals),
    years: years.map((row) => ({
      year: Number(row.year),
      declarations: Number(row.declarations_count),
      "central-kitchens": Number(row.central_declarations_count),
      "meeting-targets": Number(row.meeting_targets_count),
      "median-organic-share": percent(row.median_organic_share),
      "lowest-organic-share": percent(row.lowest_organic_share),
      "highest-organic-share": percent(row.highest_organic_share),
      "median-quality-share": percent(row.median_quality_share),
      "weighted-organic-share": percent(row.weighted_organic_share),
      "weighted-quality-share": percent(row.weighted_quality_share),
      "weighted-declarations": Number(row.weighted_declarations),
    })),
    latest:
      last && declarations
        ? {
            year: last,
            declarations: declarations.map((row) => ({
              name: row.name ?? "—",
              sectors: row.sectors,
              central: row.central,
              "organic-share": percent(row.organic_share),
              "quality-share": percent(row.quality_share),
              "meets-targets": row.meets_targets ?? undefined,
              "yearly-meals": row.yearly_meals ?? undefined,
            })),
          }
        : undefined,
    targets: CANTEEN_TARGETS,
    caveat: CANTEENS_CAVEAT,
  }
}

// --- agricultural schools

export type School = Readonly<{
  id: string
  name: string
  nature?: string
  city?: string
  "insee-code"?: string
  trainings: number
  // Kilometres between the centres of the two communes; absent for a school of the commune
  distance?: number
}>

export type Schools = Readonly<{
  // Schools of the commune; when it has none, the nearest ones
  "in-commune": boolean
  schools: School[]
  caveat: string
}>

const SCHOOLS_NEAR = 3

type SchoolRow = {
  id: string
  name: string
  nature: string | null
  city: string | null
  insee_code: string | null
  trainings_count: number
  distance: string | null
}

export async function schoolsOf(db: Db, inseeCode: string): Promise<Schools | undefined> {
  const rows = await rowsOf<SchoolRow>(
    db,
    `WITH here AS (SELECT city_centroid FROM ${table("registered_postal_codes")} WHERE code = $1 LIMIT 1),
          places AS (SELECT DISTINCT ON (code) code, city_centroid FROM ${table("registered_postal_codes")} ORDER BY code)
     SELECT s.id, COALESCE(s.public_name, s.name) AS name, s.nature, s.city, s.insee_code, s.trainings_count,
            postgis.ST_Distance(places.city_centroid::postgis.geography, here.city_centroid::postgis.geography) / 1000 AS distance
     FROM ${table("registered_agricultural_schools")} s
     JOIN places ON places.code = s.insee_code
     CROSS JOIN here
     WHERE s.kind = 'school' AND s.trainings_count > 0
     ORDER BY (s.insee_code = $1) DESC, distance, s.name
     LIMIT 12;`,
    [inseeCode],
  )

  if (rows === undefined) {
    return undefined
  }

  const here = rows.filter((row) => row.insee_code === inseeCode)
  const kept = here.length > 0 ? here : rows.slice(0, SCHOOLS_NEAR)

  return {
    "in-commune": here.length > 0,
    schools: kept.map((row) => ({
      id: row.id,
      name: row.name,
      nature: row.nature ?? undefined,
      city: row.city ?? undefined,
      "insee-code": row.insee_code ?? undefined,
      trainings: row.trainings_count,
      distance: row.insee_code === inseeCode ? undefined : rounded(row.distance, 0),
    })),
    caveat: SCHOOLS_CAVEAT,
  }
}

// --- the whole

export type Territory = Readonly<{
  "insee-code": string
  "quality-signs"?: QualitySigns
  organic?: Organic
  hve?: Hve
  canteens?: Canteens
  schools?: Schools
}>

export async function territoryOf(
  db: Db,
  inseeCode: string,
  options: { member: boolean },
): Promise<Territory> {
  const [signs, organic, hve, canteens, schools] = await Promise.all([
    qualitySignsOf(db, inseeCode),
    organicOf(db, inseeCode),
    hveOf(db, inseeCode, options.member),
    canteensOf(db, inseeCode),
    schoolsOf(db, inseeCode),
  ])

  return {
    "insee-code": inseeCode,
    "quality-signs": signs,
    organic,
    hve,
    canteens,
    schools,
  }
}

export const isEmpty = (territory: Territory) =>
  !territory["quality-signs"] &&
  !territory.organic &&
  !territory.hve &&
  !territory.canteens &&
  !territory.schools
