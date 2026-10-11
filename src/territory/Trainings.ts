import type { Pool } from "pg"

// Where a diploma of agricultural education is prepared, the nearest school
// first (RefEA). A school is placed in its commune: distances are between the
// centres of communes.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

type Db = Pick<Pool, "query">

export const ROUTES = ["school", "apprenticeship", "continuing", "higher_education"]
export const SCHOOLS_LISTED = 40

export type Training = Readonly<{
  code: string
  name: string
  diploma: string
  speciality?: string
  // school, apprenticeship, continuing or higher_education
  route: string
}>

export type TrainingSchool = Readonly<{
  id: string
  name: string
  nature?: string
  // public or privé
  sector?: string
  affiliation?: string
  address?: string
  "postal-code"?: string
  city?: string
  "insee-code"?: string
  phone?: string
  email?: string
  website?: string
  boarding: boolean
  "half-board": boolean
  // The establishment the school belongs to
  parent?: string
  // Kilometres between the centre of the place asked for and the one of the commune of the school
  distance?: number
  trainings: Training[]
}>

export type Place = Readonly<{ "insee-code": string; name: string; "postal-code"?: string }>

export type TrainingFilters = {
  place?: string
  school?: string
  diploma?: string
  speciality?: string
  route?: string
  boarding?: boolean
  q?: string
}

/**
 * The commune someone typed: an INSEE code, a postal code or a name. The first
 * commune by name when several match; undefined when none does.
 */
export async function placeOf(db: Db, typed: string): Promise<Place | undefined> {
  const text = typed.trim()

  if (text === "") {
    return undefined
  }

  // The postal reference writes names in capitals, without accent or hyphen, ST for SAINT
  const plain = (expression: string) =>
    `btrim(regexp_replace(regexp_replace(regexp_replace(upper(postgis.unaccent(${expression})), '[^A-Z0-9]+', ' ', 'g'), '\\mSAINTE\\M', 'STE', 'g'), '\\mSAINT\\M', 'ST', 'g'))`

  return db
    .query(
      `SELECT code, city_name, postal_code FROM ${table("registered_postal_codes")}
       WHERE upper(code) = upper($1) OR postal_code = $1 OR ${plain("city_name")} LIKE ${plain("$1")} || '%'
       ORDER BY (upper(code) = upper($1)) DESC, (postal_code = $1) DESC,
                (${plain("city_name")} = ${plain("$1")}) DESC, length(city_name), city_name
       LIMIT 1;`,
      [text.replace(/[%_]/g, " ")],
    )
    .then((result) =>
      result.rows[0]
        ? {
            "insee-code": result.rows[0].code as string,
            name: result.rows[0].city_name as string,
            "postal-code": (result.rows[0].postal_code as string | null) ?? undefined,
          }
        : undefined,
    )
    .catch(() => undefined)
}

export type TrainingChoices = { diplomas: string[]; specialities: string[] }

export function choicesOf(db: Db): Promise<TrainingChoices | undefined> {
  return db
    .query(
      `SELECT ARRAY(SELECT diploma FROM ${table("registered_agricultural_trainings")} GROUP BY 1 ORDER BY count(*) DESC, 1) AS diplomas,
              ARRAY(SELECT DISTINCT speciality FROM ${table("registered_agricultural_trainings")} WHERE speciality IS NOT NULL ORDER BY 1) AS specialities;`,
    )
    .then((result) => result.rows[0] as TrainingChoices)
    .catch(() => undefined)
}

type Row = {
  id: string
  name: string
  nature: string | null
  sector: string | null
  affiliation: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  insee_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  boarding: boolean
  half_board: boolean
  parent_name: string | null
  distance: string | null
  trainings: { code: string; name: string; diploma: string; speciality: string | null; route: string }[]
}

/**
 * The schools preparing what is asked for, the nearest to `place` first, by name
 * without a place. undefined when the schools are not in service.
 */
export async function findSchools(
  db: Db,
  filters: TrainingFilters,
  place?: Place,
): Promise<TrainingSchool[] | undefined> {
  const values: unknown[] = []
  const bind = (value: unknown) => {
    values.push(value)

    return `$${values.length}`
  }
  const wanted: string[] = []

  if (filters.diploma) {
    wanted.push(`t.diploma = ${bind(filters.diploma)}`)
  }
  if (filters.speciality) {
    wanted.push(`t.speciality = ${bind(filters.speciality)}`)
  }
  if (filters.route && ROUTES.includes(filters.route)) {
    wanted.push(`t.route = ${bind(filters.route)}`)
  }
  if (filters.q) {
    const text = bind(`%${filters.q.trim().replace(/[%_]/g, " ")}%`)

    wanted.push(
      `(postgis.unaccent(t.name) ILIKE postgis.unaccent(${text}) OR postgis.unaccent(COALESCE(t.speciality, '')) ILIKE postgis.unaccent(${text}))`,
    )
  }

  const schools: string[] = ["s.kind = 'school'"]

  if (filters.school) {
    schools.push(`s.id = ${bind(filters.school)}`)
  }
  if (filters.boarding) {
    schools.push("s.boarding")
  }

  const here = place
    ? `(SELECT city_centroid FROM ${table("registered_postal_codes")} WHERE code = ${bind(place["insee-code"])} LIMIT 1)`
    : "NULL::postgis.geometry"

  return db
    .query(
      `WITH places AS (SELECT DISTINCT ON (code) code, city_centroid FROM ${table("registered_postal_codes")} ORDER BY code),
            matching AS (
              SELECT t.school_id,
                     jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'diploma', t.diploma,
                                                  'speciality', t.speciality, 'route', t.route)
                               ORDER BY t.diploma, t.name, t.route) AS trainings
              FROM ${table("registered_agricultural_trainings")} t
              ${wanted.length > 0 ? "WHERE " + wanted.join(" AND ") : ""}
              GROUP BY t.school_id
            )
       SELECT s.id, COALESCE(s.public_name, s.name) AS name, s.nature, s.sector, s.affiliation, s.address, s.postal_code,
              s.city, s.insee_code, s.phone, s.email, s.website, s.boarding, s.half_board, s.parent_name,
              postgis.ST_Distance(places.city_centroid::postgis.geography, ${here}::postgis.geography) / 1000 AS distance,
              matching.trainings
       FROM ${table("registered_agricultural_schools")} s
       JOIN matching ON matching.school_id = s.id
       LEFT JOIN places ON places.code = s.insee_code
       WHERE ${schools.join(" AND ")}
       ORDER BY distance NULLS LAST, name
       LIMIT ${SCHOOLS_LISTED};`,
      values,
    )
    .then((result) =>
      (result.rows as Row[]).map((row) => ({
        id: row.id,
        name: row.name,
        nature: row.nature ?? undefined,
        sector: row.sector ?? undefined,
        affiliation: row.affiliation ?? undefined,
        address: row.address ?? undefined,
        "postal-code": row.postal_code ?? undefined,
        city: row.city ?? undefined,
        "insee-code": row.insee_code ?? undefined,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        website: row.website ?? undefined,
        boarding: row.boarding,
        "half-board": row.half_board,
        parent: row.parent_name ?? undefined,
        distance: row.distance === null ? undefined : Math.round(Number(row.distance)),
        trainings: row.trainings.map((training) => ({
          ...training,
          speciality: training.speciality ?? undefined,
        })),
      })),
    )
    .catch(() => undefined)
}
