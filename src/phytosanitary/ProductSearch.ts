import type { Pool } from "pg"

// Plant protection products by what they hold and what they are authorised
// for: the question a table of 150 rows a page cannot answer.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

const USAGES_SHOWN = 4

export type ProductQuery = Readonly<{
  name?: string
  substance?: string
  crop?: string
  target?: string
  limit: number
}>

const words = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" && value.length <= 100
    ? value.trim()
    : undefined

export function productQueryOf(args: Record<string, unknown>): ProductQuery | undefined {
  const asked = Number(args.limit)
  const query = {
    name: words(args.name),
    substance: words(args.substance),
    crop: words(args.crop),
    target: words(args.target),
    limit: Number.isInteger(asked) && asked > 0 ? Math.min(asked, 20) : 10,
  }

  return query.name || query.substance || query.crop || query.target ? query : undefined
}

// A name is found whatever its accents: é and e are the same letter here
const FOLD = (column: string) =>
  `translate(lower(${column}), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc')`
const folded = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

const rowsOf = <Row>(db: Pool, sql: string, values: unknown[]) =>
  db
    .query(sql, values)
    .then((result) => result.rows as Row[])
    .catch(() => undefined)

/**
 * E-Phy files a usage under a crop or under a group of crops: aphids of wheat
 * are under "Céréales à paille". When a crop gives nothing, the crops that the
 * rest of the query finds are named, for the search to be made again.
 */
async function otherCrops(db: Pool, asked: ProductQuery) {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const holds = (column: string, text: string) =>
    `${FOLD(column)} LIKE ${bind("%" + folded(text) + "%")}`
  const conditions = [
    `u.state = 'authorized'`,
    `p.state = 'authorized'`,
    ...(asked.target ? [holds("u.target_name_label_fra", asked.target)] : []),
    ...(asked.name ? [holds("p.name", asked.name)] : []),
    ...(asked.substance
      ? [
          `EXISTS (SELECT 1 FROM ${table("registered_phytosanitary_product_substances")} s
             WHERE s.product_id = p.id
               AND (${holds("s.french_name", asked.substance)} OR ${holds("s.substance_id", asked.substance)}))`,
        ]
      : []),
  ].join(" AND ")
  const rows = await rowsOf<{ crop: string; products: string }>(
    db,
    `SELECT u.crop_label_fra AS crop, count(DISTINCT u.product_id) AS products
     FROM ${table("registered_phytosanitary_usages")} u
     JOIN ${table("registered_phytosanitary_products")} p ON p.id = u.product_id
     WHERE ${conditions}
     GROUP BY u.crop_label_fra
     ORDER BY products DESC
     LIMIT 15;`,
    values,
  )

  return rows === undefined || rows.length === 0
    ? {}
    : {
        "no-usage-under-this-crop": asked.crop,
        "crops-the-rest-of-the-query-finds": rows.map((row) => ({
          crop: row.crop,
          products: Number(row.products),
        })),
        hint: "E-Phy files usages under a crop or a group of crops, such as Céréales à paille for wheat and barley: search again with one of these crops.",
      }
}

/**
 * The authorised products matching a query, with their substances and, when a
 * crop or a target is asked, the usages that match.
 */
export async function searchProducts(db: Pool, asked: ProductQuery) {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const holds = (column: string, text: string) =>
    `${FOLD(column)} LIKE ${bind("%" + folded(text) + "%")}`
  // A crop is named from its first letters: "ble" must not find "comestible"
  const startsWith = (column: string, text: string) =>
    `${FOLD(column)} LIKE ${bind(folded(text) + "%")}`
  const usageConditions = [
    `u.product_id = p.id`,
    `u.state = 'authorized'`,
    ...(asked.crop ? [startsWith("u.crop_label_fra", asked.crop)] : []),
    ...(asked.target ? [holds("u.target_name_label_fra", asked.target)] : []),
  ].join(" AND ")
  const conditions = [
    `p.state = 'authorized'`,
    ...(asked.name ? [holds("p.name", asked.name)] : []),
    ...(asked.substance
      ? [
          `EXISTS (SELECT 1 FROM ${table("registered_phytosanitary_product_substances")} s
             WHERE s.product_id = p.id
               AND (${holds("s.french_name", asked.substance)} OR ${holds("s.substance_id", asked.substance)}))`,
        ]
      : []),
    ...(asked.crop || asked.target
      ? [`EXISTS (SELECT 1 FROM ${table("registered_phytosanitary_usages")} u WHERE ${usageConditions})`]
      : []),
  ].join(" AND ")
  const withUsages = asked.crop !== undefined || asked.target !== undefined

  const rows = await rowsOf<{
    id: number
    name: string
    firm: string
    natures: string[] | null
    compounds: string[] | null
    total: string
    usages: unknown[] | null
  }>(
    db,
    `SELECT p.id, p.name, p.firm_name AS firm, p.natures, p.active_compounds AS compounds,
       count(*) OVER () AS total,
       ${
         withUsages
           ? `(SELECT json_agg(found) FROM (
                SELECT u.crop_label_fra AS crop, u.target_name_label_fra AS target,
                  u.dose_quantity AS dose, u.dose_unit_name AS "dose-unit",
                  round(EXTRACT(EPOCH FROM u.pre_harvest_delay) / 86400)::int AS "pre-harvest-days",
                  u.untreated_buffer_aquatic AS "water-buffer-metres",
                  u.applications_count AS applications
                FROM ${table("registered_phytosanitary_usages")} u
                WHERE ${usageConditions}
                ORDER BY u.crop_label_fra, u.target_name_label_fra
                LIMIT ${USAGES_SHOWN}) found)`
           : "NULL::json"
       } AS usages
     FROM ${table("registered_phytosanitary_products")} p
     WHERE ${conditions}
     ORDER BY p.name
     LIMIT ${bind(asked.limit)};`,
    values,
  )

  if (rows === undefined) {
    return undefined
  }

  return {
    ...(rows.length === 0 && asked.crop ? await otherCrops(db, asked) : {}),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    products: rows.map((row) => ({
      "authorisation-number": row.id,
      name: row.name,
      firm: row.firm,
      kinds: row.natures ?? [],
      substances: row.compounds ?? [],
      ...(withUsages ? { usages: row.usages ?? [] } : {}),
    })),
  }
}
