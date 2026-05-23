import type { Pool } from "pg"
import { Err, Ok, match, type AsyncResult } from "shulk"
import { API } from "../API"
import { Table } from "../Database"
import {
  Hypermedia,
  hypermedia2csv,
  hypermedia2json,
  type HypermediaType,
} from "../Hypermedia"
import { generateTablePage } from "../page-generators/generateTablePage"
import { generateResourcePage } from "../page-generators/generateResourcePage"
import { AutoTable, type AutoTableOkInput } from "../templates/views/AutoTable"
import { Field } from "../templates/components/Form"
import { BadRequest, NotFound } from "../types/HTTPErrors"
import { createHref } from "../utils"
import { CreditTable } from "./Credits"
import type { Context } from "../types/Context"
import type { Translator } from "../Translator"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

const OTE_64_VARIABLE_CODE = "OTE64F"

export interface RicaHolding {
  id: number
  idnum: number
  year: number
  region_code?: string
  new_region_code?: string
  ote_17?: string
  ote_64?: string
  economic_dimension_class?: string
  legal_form?: string
  altitude_zone?: string
  less_favoured_zone?: string
  environmental_zone?: string
  closing_date?: Date
  sau_ha?: string
  total_area_ha?: string
  gross_product?: string
  gross_operating_surplus?: string
  operating_result?: string
  extrapolation_coefficient?: string
  data?: Record<string, unknown>
}

export const RicaHoldingTable = Table<RicaHolding>({
  table: "registered_rica_holdings",
  primaryKey: "id",
})

interface RicaVariable {
  code: string
  label?: string
  data_type?: string
  length?: number
}

interface RicaModality {
  variable_code: string
  modality_code: string
  label?: string
}

const variableCache = new Map<number, Map<string, RicaVariable>>()
const modalityCache = new Map<number, Map<string, string>>()
let yearsCache: number[] | undefined
let oteCatalogCache: Map<string, string> | undefined

async function fetchVariables(
  db: Pool,
  year: number,
): AsyncResult<Error, Map<string, RicaVariable>> {
  const cached = variableCache.get(year)
  if (cached) return Ok(cached)

  const q = `SELECT code, label, data_type, length
             FROM "${DB_SCHEMA}".registered_rica_variables
             WHERE year = $1;`

  return db
    .query<RicaVariable>(q, [year])
    .then((res) => {
      const map = new Map<string, RicaVariable>()
      for (const row of res.rows) map.set(row.code, row)
      variableCache.set(year, map)
      return Ok(map)
    })
    .catch((e) => Err(e as Error))
}

async function fetchModalities(
  db: Pool,
  year: number,
): AsyncResult<Error, Map<string, string>> {
  const cached = modalityCache.get(year)
  if (cached) return Ok(cached)

  const q = `SELECT variable_code, modality_code, label
             FROM "${DB_SCHEMA}".registered_rica_modalities
             WHERE year = $1;`

  return db
    .query<RicaModality>(q, [year])
    .then((res) => {
      const map = new Map<string, string>()
      for (const row of res.rows) {
        if (row.label) map.set(row.variable_code + "|" + row.modality_code, row.label)
      }
      modalityCache.set(year, map)
      return Ok(map)
    })
    .catch((e) => Err(e as Error))
}

async function fetchYears(db: Pool): AsyncResult<Error, number[]> {
  if (yearsCache) return Ok(yearsCache)

  const q = `SELECT DISTINCT year
             FROM "${DB_SCHEMA}".registered_rica_holdings
             ORDER BY year DESC;`

  return db
    .query<{ year: number }>(q)
    .then((res) => {
      const years = res.rows.map((r) => r.year)
      yearsCache = years
      return Ok(years)
    })
    .catch((e) => Err(e as Error))
}

async function fetchOteCatalog(db: Pool): AsyncResult<Error, Map<string, string>> {
  if (oteCatalogCache) return Ok(oteCatalogCache)

  // The OTE_64 catalog is stable across years; pick the latest year that has
  // modalities. Year 2024 is verified to have all 64 codes.
  const q = `SELECT modality_code, label
             FROM "${DB_SCHEMA}".registered_rica_modalities
             WHERE variable_code = $1
             AND year = (
               SELECT MAX(year) FROM "${DB_SCHEMA}".registered_rica_modalities
               WHERE variable_code = $1
             )
             ORDER BY modality_code;`

  return db
    .query<{ modality_code: string; label: string }>(q, [OTE_64_VARIABLE_CODE])
    .then((res) => {
      const map = new Map<string, string>()
      for (const row of res.rows) map.set(row.modality_code, row.label)
      oteCatalogCache = map
      return Ok(map)
    })
    .catch((e) => Err(e as Error))
}

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({
    value: t("enterprises_title"),
    method: "GET",
    href: "/enterprises",
  }),
  Hypermedia.Link({
    value: t("enterprises_rica_title"),
    method: "GET",
    href: "/enterprises/rica",
  }),
]

function parseHoldingParam(raw: string): { year: number; idnum: number } | undefined {
  const m = raw.match(/^(\d{4})-(\d+)$/)
  if (!m) return undefined
  const year = parseInt(m[1], 10)
  const idnum = parseInt(m[2], 10)
  if (!Number.isFinite(year) || !Number.isFinite(idnum)) return undefined
  return { year, idnum }
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

export const Rica = API.new()
  .path("/enterprises/rica", async (cxt: Context) => {
    const yearsResult = await fetchYears(cxt.db)
    const oteResult = await fetchOteCatalog(cxt.db)

    const yearOptions: Record<string, string> = {}
    if (yearsResult._state === "Ok") {
      for (const y of yearsResult.val) yearOptions[String(y)] = String(y)
    }

    const oteOptions: Record<string, string> = {}
    if (oteResult._state === "Ok") {
      for (const [code, label] of oteResult.val) {
        oteOptions[code] = code + " — " + label
      }
    }

    return generateTablePage(cxt, {
      title: cxt.t("enterprises_rica_title"),
      breadcrumbs: Breadcrumbs(cxt.t).slice(0, 2),
      form: {
        year: Field.Select({
          label: cxt.t("enterprises_rica_year"),
          required: false,
          options: yearOptions,
        }),
        ote_64: Field.Select({
          label: cxt.t("enterprises_rica_ote_64"),
          required: false,
          options: oteOptions,
        }),
      },
      formHandler: (input, query) => {
        if (input.year) {
          const y = parseInt(input.year as string, 10)
          if (Number.isFinite(y)) query.where("year", "=", y)
        }
        if (input.ote_64) {
          query.where("ote_64", "=", input.ote_64)
        }
      },
      query: RicaHoldingTable(cxt.db)
        .select(
          "idnum",
          "year",
          "ote_64",
          "region_code",
          "sau_ha",
          "gross_product",
        )
        .orderBy("year", "DESC")
        .orderBy("idnum", "ASC"),
      columns: {
        idnum: cxt.t("enterprises_rica_idnum"),
        year: cxt.t("enterprises_rica_year"),
        ote_64: cxt.t("enterprises_rica_ote_64"),
        region: cxt.t("enterprises_rica_region"),
        sau: cxt.t("enterprises_rica_sau"),
        gross_product: cxt.t("enterprises_rica_gross_product"),
        details: cxt.t("common_details"),
      },
      handler: (h) => {
        const slug = h.year + "-" + h.idnum
        return {
          idnum: Hypermedia.Link({
            label: cxt.t("enterprises_rica_idnum"),
            value: String(h.idnum),
            method: "GET",
            href: "/enterprises/rica/" + slug,
          }),
          year: Hypermedia.Text({
            label: cxt.t("enterprises_rica_year"),
            value: String(h.year),
          }),
          ote_64: h.ote_64
            ? Hypermedia.Text({
                label: cxt.t("enterprises_rica_ote_64"),
                value: h.ote_64,
              })
            : undefined,
          region: h.region_code
            ? Hypermedia.Text({
                label: cxt.t("enterprises_rica_region"),
                value: h.region_code,
              })
            : undefined,
          sau:
            parseNumeric(h.sau_ha) !== undefined
              ? Hypermedia.Number({
                  label: cxt.t("enterprises_rica_sau"),
                  value: parseNumeric(h.sau_ha) as number,
                  unit: "ha",
                })
              : undefined,
          gross_product:
            parseNumeric(h.gross_product) !== undefined
              ? Hypermedia.Number({
                  label: cxt.t("enterprises_rica_gross_product"),
                  value: parseNumeric(h.gross_product) as number,
                  unit: "€",
                })
              : undefined,
          details: Hypermedia.Link({
            label: cxt.t("common_details"),
            value: cxt.t("common_see"),
            method: "GET",
            href: "/enterprises/rica/" + slug,
          }),
        }
      },
      credits: CreditTable(cxt.db).select().where("datasource", "=", "rica"),
    })
  })
  .path("/enterprises/rica/:holding", (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: Breadcrumbs(cxt.t).slice(0, 2),
      handler: async (rawId) => {
        const parsed = parseHoldingParam(rawId)
        if (!parsed) return Err(new BadRequest("Expected <year>-<idnum>"))

        const { year, idnum } = parsed

        const holdingResult = await RicaHoldingTable(cxt.db)
          .select()
          .where("year", "=", year)
          .where("idnum", "=", idnum)
          .limit(1)
          .run()
        if (holdingResult._state === "Err") return holdingResult
        const holding = holdingResult.val[0]
        if (!holding) return Err(new NotFound())

        const oteResult = await fetchOteCatalog(cxt.db)
        const oteLabel =
          holding.ote_64 && oteResult._state === "Ok"
            ? oteResult.val.get(holding.ote_64)
            : undefined

        const numberOrUndef = (key: keyof RicaHolding, unit?: string) => {
          const n = parseNumeric(holding[key] as string | undefined)
          return n !== undefined
            ? Hypermedia.Number({
                label: cxt.t("enterprises_rica_" + (key as string)),
                value: n,
                unit: unit ?? "",
              })
            : undefined
        }

        const textOrUndef = (key: keyof RicaHolding) => {
          const v = holding[key]
          return typeof v === "string" && v.length > 0
            ? Hypermedia.Text({
                label: cxt.t("enterprises_rica_" + (key as string)),
                value: v,
              })
            : undefined
        }

        return Ok({
          title: cxt.t("enterprises_rica_title") + " — " + idnum + " (" + year + ")",
          details: {
            idnum: Hypermedia.Text({
              label: cxt.t("enterprises_rica_idnum"),
              value: String(holding.idnum),
            }),
            year: Hypermedia.Text({
              label: cxt.t("enterprises_rica_year"),
              value: String(holding.year),
            }),
            ote_64: holding.ote_64
              ? Hypermedia.Text({
                  label: cxt.t("enterprises_rica_ote_64"),
                  value: oteLabel
                    ? holding.ote_64 + " — " + oteLabel
                    : holding.ote_64,
                })
              : undefined,
            ote_17: textOrUndef("ote_17"),
            region_code: textOrUndef("region_code"),
            new_region_code: textOrUndef("new_region_code"),
            economic_dimension_class: textOrUndef("economic_dimension_class"),
            legal_form: textOrUndef("legal_form"),
            altitude_zone: textOrUndef("altitude_zone"),
            less_favoured_zone: textOrUndef("less_favoured_zone"),
            environmental_zone: textOrUndef("environmental_zone"),
            closing_date: holding.closing_date
              ? Hypermedia.Date({
                  label: cxt.t("enterprises_rica_closing_date"),
                  value: cxt.dateTimeFormatter.Date(holding.closing_date),
                  iso: holding.closing_date.toISOString(),
                })
              : undefined,
            sau_ha: numberOrUndef("sau_ha", "ha"),
            total_area_ha: numberOrUndef("total_area_ha", "ha"),
            gross_product: numberOrUndef("gross_product", "€"),
            gross_operating_surplus: numberOrUndef("gross_operating_surplus", "€"),
            operating_result: numberOrUndef("operating_result", "€"),
            extrapolation_coefficient: numberOrUndef("extrapolation_coefficient"),
          },
          sections: {},
          links: [
            Hypermedia.Link({
              value: cxt.t("enterprises_rica_variables_link"),
              method: "GET",
              href: "/enterprises/rica/" + year + "-" + idnum + "/variables",
            }),
          ],
        })
      },
    }),
  )
  .path("/enterprises/rica/:holding/variables", async (cxt: Context) => {
    const rawHolding = cxt.params.holding
    const parsed = parseHoldingParam(rawHolding)
    if (!parsed) {
      return new Response("Bad request: expected <year>-<idnum>", { status: 400 })
    }
    const { year, idnum } = parsed

    const holdingResult = await RicaHoldingTable(cxt.db)
      .select("idnum", "year", "data")
      .where("year", "=", year)
      .where("idnum", "=", idnum)
      .limit(1)
      .run()
    if (holdingResult._state === "Err") {
      return new Response(holdingResult.val.message, { status: 500 })
    }
    const holding = holdingResult.val[0]
    if (!holding) {
      return new Response("Not found", { status: 404 })
    }

    const [variablesResult, modalitiesResult] = await Promise.all([
      fetchVariables(cxt.db, year),
      fetchModalities(cxt.db, year),
    ])
    if (variablesResult._state === "Err") {
      return new Response(variablesResult.val.message, { status: 500 })
    }
    if (modalitiesResult._state === "Err") {
      return new Response(modalitiesResult.val.message, { status: 500 })
    }
    const variables = variablesResult.val
    const modalities = modalitiesResult.val

    const rows: Record<string, HypermediaType["any"] | undefined>[] = []
    for (const [key, rawValue] of Object.entries(holding.data ?? {})) {
      const code = key.toUpperCase()
      const variable = variables.get(code)
      const valueStr = rawValue === null || rawValue === undefined ? "" : String(rawValue)
      const dt = variable?.data_type
      // Variable catalog stores French labels: "numérique", "caractères".
      const isNumeric = dt === "numérique" || dt === "num"
      const isCharacter = dt === "caractères" || dt === "char"
      const numeric = isNumeric ? parseNumeric(valueStr) : undefined
      const resolved = isCharacter
        ? modalities.get(code + "|" + valueStr)
        : undefined

      rows.push({
        code: Hypermedia.Text({
          label: cxt.t("enterprises_rica_variable_code"),
          value: code,
        }),
        label: variable?.label
          ? Hypermedia.Text({
              label: cxt.t("enterprises_rica_variable_label"),
              value: variable.label,
            })
          : undefined,
        value:
          numeric !== undefined
            ? Hypermedia.Number({
                label: cxt.t("enterprises_rica_variable_value"),
                value: numeric,
              })
            : Hypermedia.Text({
                label: cxt.t("enterprises_rica_variable_value"),
                value: valueStr,
              }),
        resolved: resolved
          ? Hypermedia.Text({
              label: cxt.t("enterprises_rica_variable_resolved"),
              value: resolved,
            })
          : undefined,
      })
    }

    rows.sort((a, b) => {
      const ca = (a.code as HypermediaType["Text"]).value
      const cb = (b.code as HypermediaType["Text"]).value
      return ca < cb ? -1 : ca > cb ? 1 : 0
    })

    const basePath = "/enterprises/rica/" + year + "-" + idnum + "/variables"
    const pageData: AutoTableOkInput = {
      title:
        cxt.t("enterprises_rica_variables_title") +
        " — " +
        idnum +
        " (" +
        year +
        ")",
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: String(idnum) + " (" + year + ")",
          method: "GET",
          href: "/enterprises/rica/" + year + "-" + idnum,
        }),
      ],
      table: {
        columns: {
          code: cxt.t("enterprises_rica_variable_code"),
          label: cxt.t("enterprises_rica_variable_label"),
          value: cxt.t("enterprises_rica_variable_value"),
          resolved: cxt.t("enterprises_rica_variable_resolved"),
        },
        rows,
      },
      "items-per-page": rows.length || 1,
      "items-count": rows.length,
      "items-total": rows.length,
      page: 1,
      "total-pages": 1,
      pages: [],
      navigation: {
        "first-page": undefined,
        "previous-page": undefined,
        "next-page": undefined,
        "last-page": undefined,
      },
      formats: {
        html: Hypermedia.Link({
          value: "HTML",
          method: "GET",
          href: createHref(basePath, cxt.query),
        }),
        json: Hypermedia.Link({
          value: "JSON",
          method: "GET",
          href: createHref(basePath + ".json", cxt.query),
        }),
        csv: Hypermedia.Link({
          value: "CSV",
          method: "GET",
          href: createHref(basePath + ".csv", cxt.query),
        }),
      },
    }

    return match(cxt.output)
      .returnType<string | object>()
      .case({
        html: () => AutoTable({ page: Ok(pageData), context: cxt }),
        json: () => hypermedia2json(cxt.request, pageData),
        csv: () => hypermedia2csv(pageData),
        _otherwise: () =>
          new Response("Output format not supported.", { status: 400 }),
      })
  })
