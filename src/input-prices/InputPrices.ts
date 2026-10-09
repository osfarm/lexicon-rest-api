import type { Pool } from "pg"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type Db = Pick<Pool, "query">

// The price of an input, as Ekylibre reads it: master_prices for the articles
// (fertilisers, seeds, fuel…), master_phytosanitary_prices for the plant
// protection products, by their authorisation number. master_price_sources says
// where each price comes from. These tables are open: they hold the price of an
// article, never who sells it.

export const MAX_RESULTS = 20
// A price older than that says more about the past than about what to pay
const STALE_AFTER_DAYS = 548

const UNITS: Record<string, string> = {
  ton_bulk: "ton",
  kilo_bulk: "kilogram",
  liter_bulk: "liter",
  cubic_meter_bulk: "cubic-meter",
  quintal_bulk: "quintal",
  hectoliter_bulk: "hectoliter",
  unity_bulk: "unit",
  kilometer_bulk: "kilometer",
}

export type InputKind = "phytosanitary" | "fertilizer" | "seed" | "fuel" | "other"

export type InputPriceRow = Readonly<{
  kind: string
  id: string
  name: string
  detail: string | null
  amount: string | number
  packaging: string
  started_on: Date | string
  method: string | null
  source: string | null
  negotiated: boolean | null
}>

export type InputPrice = Readonly<{
  kind: InputKind
  id: string
  name: string
  detail?: string
  price: number
  currency: "EUR"
  unit: string
  "price-date": string
  method: string
  source?: string
  negotiated: boolean
  stale: boolean
  cost?: number
}>

export type PriceQuery = Readonly<{ query: string; quantity?: number; limit: number }>

/**
 * What a caller asks for: a few words naming the input, and optionally how much of it.
 */
export function priceQueryOf(input: Record<string, unknown>): PriceQuery | undefined {
  const query = typeof input.query === "string" ? input.query.trim() : ""
  const quantity = Number(input.quantity)
  const limit = Number(input.limit)

  return query.length < 2
    ? undefined
    : {
        query: query.slice(0, 80),
        quantity:
          input.quantity !== undefined && Number.isFinite(quantity) && quantity > 0
            ? quantity
            : undefined,
        limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_RESULTS) : 10,
      }
}

const KINDS: Record<string, InputKind> = {
  phytosanitary: "phytosanitary",
  plant_medicine: "phytosanitary",
  fertilizer: "fertilizer",
  seed_and_plant: "seed",
  fuel: "fuel",
}

function isoDay(date: Date | string): string {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)
}

/**
 * One price as it is answered. The cost is the price times the quantity asked,
 * which the caller gives in the unit of the price.
 */
export function inputPriceOf(
  row: InputPriceRow,
  now: Date,
  quantity?: number,
): InputPrice {
  const price = Number(row.amount)
  const day = isoDay(row.started_on)
  const age = (now.getTime() - new Date(day).getTime()) / 86400000

  return {
    kind: KINDS[row.kind] ?? "other",
    id: row.id,
    name: row.name,
    ...(row.detail ? { detail: row.detail } : {}),
    price,
    currency: "EUR",
    unit: UNITS[row.packaging] ?? row.packaging,
    "price-date": day,
    method: row.method ?? "reference",
    ...(row.source ? { source: row.source } : {}),
    negotiated: row.negotiated === true,
    stale: age > STALE_AFTER_DAYS,
    ...(quantity === undefined ? {} : { cost: Math.round(price * quantity * 100) / 100 }),
  }
}

const plain = (expression: string) => `postgis.unaccent(lower(${expression}))`

// The latest price of each product or article whose name holds the words asked.
// Equipment is left out: its prices are scales by the hour, not the price of an input.
const SEARCH = `
  WITH asked AS (SELECT '%' || ${plain("$1")} || '%' AS pattern),
  phytosanitary AS (
    SELECT DISTINCT ON (price.reference_article_name, price.reference_packaging_name)
           'phytosanitary' AS kind, price.reference_article_name::text AS id, product.name,
           array_to_string(product.active_compounds, ', ') AS detail,
           price.unit_pretax_amount AS amount, price.reference_packaging_name AS packaging,
           price.started_on, price.id AS price_id, (product.state = 'authorized') AS current
      FROM "${DB_SCHEMA}".master_phytosanitary_prices AS price
      JOIN "${DB_SCHEMA}".registered_phytosanitary_products AS product ON product.id = price.reference_article_name
      CROSS JOIN asked
     WHERE ${plain("product.name")} LIKE asked.pattern
        OR ${plain("array_to_string(product.active_compounds, ' ')")} LIKE asked.pattern
        OR price.reference_article_name::text = $1
     ORDER BY price.reference_article_name, price.reference_packaging_name, price.started_on DESC
  ),
  articles AS (
    SELECT DISTINCT ON (price.reference_article_name, price.reference_packaging_name)
           variant.category AS kind, price.reference_article_name AS id,
           COALESCE(label.fra, price.reference_article_name) AS name, label.eng AS detail,
           price.unit_pretax_amount AS amount, price.reference_packaging_name AS packaging,
           price.started_on, price.id AS price_id, true AS current
      FROM "${DB_SCHEMA}".master_prices AS price
      JOIN "${DB_SCHEMA}".master_variants AS variant ON variant.reference_name = price.reference_article_name
      LEFT JOIN "${DB_SCHEMA}".master_translations AS label ON label.id = variant.translation_id
      CROSS JOIN asked
     WHERE variant.category <> 'equipment'
       AND (${plain("label.fra")} LIKE asked.pattern OR ${plain("label.eng")} LIKE asked.pattern
            OR ${plain("replace(price.reference_article_name, '_', ' ')")} LIKE asked.pattern)
     ORDER BY price.reference_article_name, price.reference_packaging_name, price.started_on DESC
  )
  SELECT found.kind, found.id, found.name, found.detail, found.amount, found.packaging, found.started_on,
         origin.method, origin.source, origin.negotiated
    FROM (SELECT * FROM phytosanitary UNION ALL SELECT * FROM articles) AS found
    LEFT JOIN "${DB_SCHEMA}".master_price_sources AS origin ON origin.id = found.price_id
   ORDER BY found.current DESC, found.started_on DESC, found.name
   LIMIT $2`

/**
 * The latest prices of the inputs whose name, or active substance, holds the words asked.
 *
 * @returns undefined when the prices are not in service
 */
export async function searchInputPrices(
  db: Db,
  asked: PriceQuery,
  now: Date = new Date(),
): Promise<InputPrice[] | undefined> {
  return db.query(SEARCH, [asked.query, asked.limit]).then(
    (result) =>
      result.rows.map((row: InputPriceRow) => inputPriceOf(row, now, asked.quantity)),
    () => undefined,
  )
}

export type Unpriced = Readonly<{ count: number; examples: string[] }>

const UNPRICED = `
  SELECT count(*) OVER () AS total, product.name
    FROM "${DB_SCHEMA}".registered_phytosanitary_products AS product
   WHERE product.state = 'authorized'
     AND (${plain("product.name")} LIKE '%' || ${plain("$1")} || '%'
          OR ${plain("array_to_string(product.active_compounds, ' ')")} LIKE '%' || ${plain("$1")} || '%')
     AND NOT EXISTS (SELECT 1 FROM "${DB_SCHEMA}".master_phytosanitary_prices AS price
                      WHERE price.reference_article_name = product.id)
   ORDER BY product.name
   LIMIT 5`

/**
 * The authorised plant protection products the words name and that have no price:
 * an empty answer must not be read as "this does not exist".
 */
export async function unpricedProducts(db: Db, asked: PriceQuery): Promise<Unpriced> {
  return db.query(UNPRICED, [asked.query]).then(
    (result) => ({
      count: Number(result.rows[0]?.total ?? 0),
      examples: result.rows.map((row: { name: string }) => row.name),
    }),
    () => ({ count: 0, examples: [] }),
  )
}
