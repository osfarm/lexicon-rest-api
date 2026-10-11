import type { Pool } from "pg"

// Yields and selling prices of a production, by department: what the parcel
// identifier draws, asked by the name of the crop.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

const PRODUCTIONS_KEPT = 6
const PRICES_KEPT = 12

export type FiguresQuery = Readonly<{ production: string; department?: string }>

type Production = { reference: string; specie: string; fra: string | null; eng: string | null }

/**
 * A text without capitals, accents or punctuation, to compare names.
 */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export function figuresQueryOf(args: Record<string, unknown>): FiguresQuery | undefined {
  const production = typeof args.production === "string" ? args.production.trim() : ""
  const department =
    typeof args.department === "string" || typeof args.department === "number"
      ? String(args.department).trim().toUpperCase().padStart(2, "0")
      : undefined

  return production === "" || production.length > 100
    ? undefined
    : {
        production,
        department:
          department !== undefined && /^[0-9][0-9AB][0-9]?$/.test(department)
            ? department
            : undefined,
      }
}

/**
 * The productions a few words name, the closest first: every word must be in
 * the reference name or in a label.
 */
export function productionsNamed<P extends Production>(productions: P[], asked: string): P[] {
  const words = fold(asked).split(" ").filter(Boolean)
  const named = (production: P) =>
    [production.reference.replaceAll("_", " "), production.fra ?? "", production.eng ?? ""].map(
      fold,
    )

  return productions
    .filter((production) =>
      words.every((word) => named(production).some((name) => name.includes(word))),
    )
    .sort(
      (a, b) =>
        Math.min(...named(a).map((name) => name.length)) -
        Math.min(...named(b).map((name) => name.length)),
    )
}

const rowsOf = <Row>(db: Pool, sql: string, values: unknown[]) =>
  db
    .query(sql, values)
    .then((result) => result.rows as Row[])
    .catch(() => undefined)

export const DOCUMENTATION_CREDIT =
  "Documentation: page of the production on the wiki Triple Performance (tripleperformance.fr), CC-BY-SA 4.0."

/**
 * Where each production is documented on the wiki Triple Performance, by
 * reference name. Without references, every production that has a page. Empty
 * when the package is not in service.
 */
export function documentationsOf(
  db: Pick<Pool, "query">,
  references?: string[],
): Promise<Map<string, string>> {
  return db
    .query(
      `SELECT production_reference_name AS reference, url
       FROM ${table("master_production_documentations")}
       WHERE source = 'tripleperformance' AND ($1::varchar[] IS NULL OR production_reference_name = ANY($1))
       ORDER BY 1;`,
      [references ?? null],
    )
    .then((result) => new Map(result.rows.map((row) => [row.reference as string, row.url as string])))
    .catch(() => new Map())
}

/**
 * Yields by campaign and latest prices of the productions a query names, in a
 * department or, without one, as the average of the departments.
 */
export async function cropFigures(db: Pool, asked: FiguresQuery) {
  const all = await rowsOf<Production>(
    db,
    `SELECT p.reference_name AS reference, p.specie, t.fra, t.eng
     FROM ${table("master_productions")} p
     LEFT JOIN ${table("master_translations")} t ON t.id = p.translation_id;`,
    [],
  )

  if (all === undefined) {
    return undefined
  }

  const named = productionsNamed(all, asked.production)
  const references = named.map((production) => production.reference)
  const species = [...new Set(named.map((production) => production.specie).filter(Boolean))]

  const yields = await rowsOf<{
    production: string
    campaign: number
    value: string
    unit: string
    departments: string
  }>(
    db,
    `SELECT production, campaign, round(avg(yield_value), 1) AS value, yield_unit AS unit,
       count(DISTINCT department_zone) AS departments
     FROM ${table("master_production_yields")}
     WHERE production = ANY($1) AND ($2::text IS NULL OR department_zone = $2)
     GROUP BY production, campaign, yield_unit
     ORDER BY production, campaign DESC;`,
    [references, asked.department ?? null],
  )
  const prices = await rowsOf<{
    specie: string
    label: string | null
    nature: string | null
    zone: string
    campaign: number
    started_on: Date
    price: string
    unit: string
    organic: boolean | null
  }>(
    db,
    `SELECT specie, label, nature, department_zone AS zone, campaign, started_on,
       final_price AS price, price_unit AS unit, organic
     FROM ${table("master_production_prices")}
     WHERE specie = ANY($1) AND final_price > 0 AND department_zone = ANY($2)
     ORDER BY started_on DESC, (department_zone = '0')
     LIMIT ${PRICES_KEPT};`,
    [species, asked.department ? [asked.department, "0"] : ["0"]],
  )
  const withYields = new Set((yields ?? []).map((row) => row.production))
  // The productions that have figures come first: many names have none
  const kept = [...named]
    .sort((a, b) => Number(withYields.has(b.reference)) - Number(withYields.has(a.reference)))
    .slice(0, PRODUCTIONS_KEPT)
  const documentations = await documentationsOf(
    db,
    kept.map((production) => production.reference),
  )

  return {
    query: asked.production,
    ...(asked.department ? { department: asked.department } : {}),
    productions: kept.map((production) => ({
      reference: production.reference,
      name: production.fra,
      specie: production.specie,
      "has-yields": withYields.has(production.reference),
      // The page of the production on the wiki Triple Performance, when it has one
      documentation: documentations.get(production.reference),
    })),
    yields: (yields ?? []).map((row) => ({
      production: row.production,
      campaign: row.campaign,
      yield: Number(row.value),
      unit: row.unit,
      ...(asked.department ? {} : { "departments-averaged": Number(row.departments) }),
    })),
    prices: (prices ?? []).map((row) => ({
      specie: row.specie,
      label: row.label,
      kind: row.nature,
      zone: row.zone === "0" ? "France" : row.zone,
      campaign: row.campaign,
      date: new Date(row.started_on).toISOString().slice(0, 10),
      price: Number(row.price),
      currency: "EUR",
      unit: row.unit,
      ...(row.organic === null ? {} : { organic: row.organic }),
    })),
  }
}
