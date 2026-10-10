import type { Pool } from "pg"
import { fold } from "../crop-figures/CropFigures"

// Purchases of plant protection products estimated commune by commune (BNV-D,
// SDES): kilograms of active substance, by year. Purchases, not uses: a quantity
// is declared at the postal code of the buyer, then shared between its communes
// in proportion to their farmland outside grassland.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

const SUBSTANCES_SHOWN = 10
const PLACES_SHOWN = 10
const SUBSTANCES_NAMED = 8
// Below this farmland a quantity per hectare says nothing: a town whose buyers
// farm elsewhere would show hundreds of kilograms per hectare
const FARMLAND_FOR_A_RATIO = 50

export const PURCHASES_CAVEAT =
  "Purchases, not uses: quantities of active substance declared by distributors at the postal code of the buyer (BNV-D), shared between the communes of that postal code in proportion to their farmland outside grassland. Where and when a product is bought says neither where nor when it is applied. Postal codes with five farms or fewer are kept secret. Source: SDES, Licence Ouverte."

export type CommunePurchases = Readonly<{
  "insee-code": string
  // Farmland outside grassland declared to the CAP in the commune, in hectares, and its campaign
  farmland?: { hectares: number; campaign: number }
  years: {
    year: number
    // Kilograms of active substance; absent when every purchase of the year is secret
    quantity?: number
    // Kilograms per hectare of today's farmland outside grassland
    "per-hectare"?: number
    products: number
    substances: number
    // Some purchases of the year are under statistical secrecy and are not counted
    masked: boolean
  }[]
  latest?: {
    year: number
    "by-function": { function: string; quantity: number }[]
    "by-danger": { danger: string; quantity: number }[]
    "top-substances": {
      substance: string
      "cas-number"?: string
      function: string
      danger?: string
      quantity: number
    }[]
  }
}>

const rowsOf = <Row>(db: Pool, sql: string, values: unknown[]) =>
  db
    .query(sql, values)
    .then((result) => result.rows as Row[])
    .catch(() => undefined)

const rounded = (value: unknown, digits = 1) => {
  const factor = 10 ** digits

  return Math.round(Number(value) * factor) / factor
}

/**
 * Farmland of a commune outside grassland, in hectares: the parcels of the
 * latest CAP campaign whose centre falls in the commune, meadows left out.
 */
export async function farmlandOf(db: Pool, inseeCode: string) {
  const rows = await rowsOf<{ hectares: string | null; campaign: number | null }>(
    db,
    `SELECT round(sum(postgis.ST_Area(postgis.ST_Transform(g.shape, 2154))) / 10000) AS hectares,
       max(g.campaign) AS campaign
     FROM ${table("registered_graphic_parcels")} g,
       (SELECT city_shape FROM ${table("registered_postal_codes")}
        WHERE code = $1 AND city_shape IS NOT NULL LIMIT 1) commune
     WHERE postgis.ST_Contains(commune.city_shape, g.centroid)
       AND g.cap_crop_code NOT IN (
         SELECT cap_code FROM ${table("master_crop_production_cap_codes")} WHERE production = 'meadow');`,
    [inseeCode],
  )
  const found = rows?.[0]

  return found && found.hectares !== null && Number(found.hectares) > 0 && found.campaign !== null
    ? { hectares: Number(found.hectares), campaign: found.campaign }
    : undefined
}

/**
 * What a commune bought, year by year, and what the last year is made of.
 * Undefined when the purchases are not in service or say nothing of the commune.
 */
export async function communePurchases(
  db: Pool,
  inseeCode: string,
): Promise<CommunePurchases | undefined> {
  const [years, farmland] = await Promise.all([
    rowsOf<{
      year: number
      quantity: string | null
      products_count: number
      substances_count: number
      masked: boolean
    }>(
      db,
      `SELECT year, quantity, products_count, substances_count, masked
       FROM ${table("registered_phytosanitary_purchase_communes")}
       WHERE insee_code = $1 ORDER BY year;`,
      [inseeCode],
    ),
    farmlandOf(db, inseeCode),
  ])

  if (years === undefined || years.length === 0) {
    return undefined
  }

  const latestYear = [...years].reverse().find((year) => year.quantity !== null)?.year
  const [summaries, substances] =
    latestYear === undefined
      ? [undefined, undefined]
      : await Promise.all([
          rowsOf<{ function: string; danger: string; quantity: string }>(
            db,
            `SELECT function, danger, quantity
             FROM ${table("registered_phytosanitary_purchase_summaries")}
             WHERE insee_code = $1 AND year = $2;`,
            [inseeCode, latestYear],
          ),
          rowsOf<{
            substance: string
            cas_number: string | null
            function: string
            danger: string | null
            quantity: string
          }>(
            db,
            `SELECT substance, min(cas_number) AS cas_number, min(function) AS function,
               min(danger) AS danger, sum(quantity) AS quantity
             FROM ${table("registered_phytosanitary_purchases")}
             WHERE insee_code = $1 AND year = $2
             GROUP BY substance ORDER BY sum(quantity) DESC LIMIT ${SUBSTANCES_SHOWN};`,
            [inseeCode, latestYear],
          ),
        ])

  const totalsBy = (key: "function" | "danger") =>
    [
      ...(summaries ?? [])
        .reduce(
          (totals, row) => totals.set(row[key], (totals.get(row[key]) ?? 0) + Number(row.quantity)),
          new Map<string, number>(),
        )
        .entries(),
    ]
      .map(([name, quantity]) => ({ name, quantity: rounded(quantity) }))
      .sort((one, other) => other.quantity - one.quantity)

  return {
    "insee-code": inseeCode,
    farmland,
    years: years.map((row) => ({
      year: row.year,
      quantity: row.quantity === null ? undefined : rounded(row.quantity),
      "per-hectare":
        row.quantity === null || farmland === undefined || farmland.hectares < FARMLAND_FOR_A_RATIO
          ? undefined
          : rounded(Number(row.quantity) / farmland.hectares, 2),
      products: row.products_count,
      substances: row.substances_count,
      masked: row.masked,
    })),
    latest:
      latestYear === undefined
        ? undefined
        : {
            year: latestYear,
            "by-function": totalsBy("function").map(({ name, quantity }) => ({
              function: name,
              quantity,
            })),
            "by-danger": totalsBy("danger").map(({ name, quantity }) => ({
              danger: name,
              quantity,
            })),
            "top-substances": (substances ?? []).map((row) => ({
              substance: row.substance,
              "cas-number": row.cas_number ?? undefined,
              function: row.function,
              danger: row.danger ?? undefined,
              quantity: rounded(row.quantity),
            })),
          },
  }
}

export type SubstanceQuery = Readonly<{ substance: string; year?: number }>

export function substanceQueryOf(args: Record<string, unknown>): SubstanceQuery | undefined {
  const substance = typeof args.substance === "string" ? fold(args.substance) : ""
  const year = Number(args.year)

  return substance === "" || substance.length > 80
    ? undefined
    : { substance, year: Number.isInteger(year) && year > 2000 && year < 2100 ? year : undefined }
}

/**
 * What France bought of a substance: the total of each year, and for one year
 * the departments and the communes that bought most. The substance is found by
 * a few letters of its name; when several match, the largest is told and the
 * others named.
 */
export async function substancePurchases(db: Pool, asked: SubstanceQuery) {
  const named = await rowsOf<{ substance: string; quantity: string }>(
    db,
    `SELECT substance, sum(quantity) AS quantity
     FROM ${table("registered_phytosanitary_purchase_substances")}
     GROUP BY substance;`,
    [],
  )

  if (named === undefined) {
    return undefined
  }

  const words = asked.substance.split(" ").filter(Boolean)
  const matching = named
    .filter((row) => words.every((word) => fold(row.substance).includes(word)))
    .sort(
      (one, other) =>
        Number(fold(other.substance) === asked.substance) -
          Number(fold(one.substance) === asked.substance) ||
        Number(other.quantity) - Number(one.quantity),
    )
  const substance = matching[0]?.substance

  if (substance === undefined) {
    return { substance: undefined, years: [] }
  }

  const years = await rowsOf<{
    year: number
    cas_number: string | null
    function: string
    danger: string | null
    quantity: string
    communes_count: number
    products_count: number
  }>(
    db,
    `SELECT year, cas_number, function, danger, quantity, communes_count, products_count
     FROM ${table("registered_phytosanitary_purchase_substances")}
     WHERE substance = $1 ORDER BY year;`,
    [substance],
  )
  const year = years?.find((row) => row.year === asked.year)?.year ?? years?.at(-1)?.year

  const [departments, communes] = await Promise.all([
    rowsOf<{ department: string; quantity: string }>(
      db,
      `SELECT left(insee_code, 2) AS department, sum(quantity) AS quantity
       FROM ${table("registered_phytosanitary_purchases")}
       WHERE substance = $1 AND year = $2
       GROUP BY 1 ORDER BY sum(quantity) DESC LIMIT ${PLACES_SHOWN};`,
      [substance, year],
    ),
    rowsOf<{ insee_code: string; name: string | null; quantity: string }>(
      db,
      `SELECT p.insee_code, (SELECT city_name FROM ${table("registered_postal_codes")}
                             WHERE code = p.insee_code LIMIT 1) AS name, p.quantity
       FROM (SELECT insee_code, sum(quantity) AS quantity
             FROM ${table("registered_phytosanitary_purchases")}
             WHERE substance = $1 AND year = $2
             GROUP BY insee_code ORDER BY sum(quantity) DESC LIMIT ${PLACES_SHOWN}) p
       ORDER BY p.quantity DESC;`,
      [substance, year],
    ),
  ])

  return {
    substance,
    "cas-number": years?.at(-1)?.cas_number ?? undefined,
    function: years?.at(-1)?.function,
    danger: years?.at(-1)?.danger ?? undefined,
    "other-substances-matching": matching.slice(1, SUBSTANCES_NAMED + 1).map((row) => row.substance),
    years: (years ?? []).map((row) => ({
      year: row.year,
      "quantity-kg": rounded(row.quantity, 0),
      communes: row.communes_count,
      products: row.products_count,
    })),
    year,
    "top-departments": (departments ?? []).map((row) => ({
      department: row.department,
      "quantity-kg": rounded(row.quantity, 0),
    })),
    "top-communes": (communes ?? []).map((row) => ({
      "insee-code": row.insee_code,
      name: row.name ?? undefined,
      "quantity-kg": rounded(row.quantity, 0),
    })),
  }
}
