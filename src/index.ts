import { Elysia, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits } from "./templates/Credits"
import { useTranslator, type Translator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import {
  Hypermedia,
  hypermedia2csv,
  hypermedia2json,
  HypermediaList,
  type HypermediaType,
} from "./Hypermedia"
import { AutoTable } from "./templates/AutoTable"
import { Concurrently, match } from "shulk"
import { Table, type t_Select } from "./Database"
import { Field, type FieldType } from "./templates/components/Form"
import { Client } from "pg"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = parseInt(import.meta.env.DB_PORT as string)
const DB_USER = import.meta.env.DB_USER
const DB_PASSWORD = import.meta.env.DB_PASSWORD
const DB_NAME = import.meta.env.DB_NAME

const sql = new Client({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
})
await sql.connect()

const PORT = 3000
const AVAILABLE_LANGUAGES = ["fr", "en"]

type OutputFormat = "html" | "json" | "csv"

function createHref(
  basePath: string,
  query: { page?: number; [key: string]: unknown }
) {
  const queryString = Object.entries(query)
    .map(([key, value]) => `${key}=${value}`)
    .join("&")

  return basePath + "?" + queryString
}

type VineVariety = {
  id: string
  shortName: string
  longName?: string
  category: VineCategory
  color?: VineColor
  utilities?: string[]
}

enum VineColor {
  BLACK = "black",
  WHITE = "white",
  GREY = "grey",
}

enum VineCategory {
  VARIETY = "variety",
  HYBRID = "hybrid",
  ROOTSTOCK = "rootstock",
}

const VineVarietyTable = Table<VineVariety>({
  table: "registered_vine_varieties",
  primaryKey: "id",
  map: {
    id: "id",
    shortName: "short_name",
    longName: "long_name",
    color: "color",
    category: "category",
    utilities: "utilities",
  },
})

function ObjectMap<T extends object, P>(
  obj: T,
  fn: (key: keyof T, value: T[keyof T]) => P
): Record<keyof T, P> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      fn(key as keyof T, value as any),
    ])
  ) as Record<keyof T, P>
}

interface Context {
  path: string
  request: Request
  query: Record<string, string | number>
  t: Translator
  output: OutputFormat
}

interface AutoTableParams<T extends object, F extends string> {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: Record<string, FieldType["any"]>
  query: t_Select<T>
  columns: Record<F, string>
  handler: (obj: T) => Record<F, HypermediaType["any"] | undefined>
}

async function generateTablePage<T extends object, F extends string>(
  context: Context,
  params: AutoTableParams<T, F>
) {
  const PER_PAGE = 50

  const { path, request, query: queryParams, t, output } = context

  const { page } = queryParams

  if (typeof page !== "number") {
    return
  }

  const enhancedQuery = params.query
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE)

  Object.entries(queryParams)
    .filter(([key]) => key !== "page")
    .filter(([, value]) => value !== undefined)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => enhancedQuery.where(key as keyof T, "=", value))

  // prettier-ignore
  const result = await Concurrently
    .run(() => enhancedQuery.run())
    .and(() => params.query.count())
    .done()

  const pageData = result
    .map(
      ([items, count]) => [items, count, Math.ceil(count / PER_PAGE)] as const
    )
    .map(([items, count, totalPages]) => ({
      title: params.title,
      breadcrumbs: params.breadcrumbs,
      form: ObjectMap(params.form, (key, field) => ({
        ...field,
        defaultValue: queryParams[key] as string,
      })),
      table: {
        columns: params.columns,
        rows: items.map(params.handler),
      },
      "items-per-page": PER_PAGE,
      "items-count": items.length,
      "items-total": count,
      page: page,
      "total-pages": totalPages,
      navigation: {
        "previous-page":
          page > 1
            ? Hypermedia.Link({
                value: t("navigation_previous_page"),
                method: "GET",
                href: createHref(path, {
                  ...params.query,
                  page: page - 1,
                }),
              })
            : undefined,
        "next-page":
          page < totalPages
            ? Hypermedia.Link({
                value: t("navigation_next_page"),
                method: "GET",
                href: createHref(path, {
                  ...params.query,
                  page: page + 1,
                }),
              })
            : undefined,
      },
    }))
    .mapErr((error) => ({
      title: params.title,
      breadcrumbs: params.breadcrumbs,
      form: params.form,
      error: error,
    }))

  return match(output)
    .returnType<string | object>()
    .case({
      html: () => AutoTable({ page: pageData, t }),
      json: () => hypermedia2json(request, pageData.val),
      csv: () => hypermedia2csv(pageData.val),
    })
}

new Elysia()
  .use(staticPlugin())
  .use(
    swagger({
      path: "/documentation",
      documentation: {
        info: {
          title: "Lexicon REST API documentation",
          version: packageJson.version,
        },
      },
    })
  )
  .use(html())
  .derive(({ headers, path }) => {
    const clientDesiredLanguage =
      headers["Accept-Language"]?.split(",")[0]?.split("-")[0] || ""

    const serverLanguage = AVAILABLE_LANGUAGES.includes(clientDesiredLanguage)
      ? (clientDesiredLanguage as string)
      : "fr"

    let output: OutputFormat = "html"
    if (path.endsWith(".json")) {
      output = "json"
    } else if (path.endsWith(".csv")) {
      output = "csv"
    }

    return {
      output,
      language: serverLanguage,
      t: useTranslator(serverLanguage),
    }
  })
  .get("/", () => Home())
  .get(
    "/viticulture/vine-varieties*",
    (context) =>
      generateTablePage(context, {
        title: context.t("viticulture_vine_variety_title"),
        breadcrumbs: [
          Hypermedia.Link({
            value: context.t("home_title"),
            method: "GET",
            href: "/",
          }),
          Hypermedia.Link({
            value: context.t("viticulture_title"),
            method: "GET",
            href: "/viticulture/",
          }),
        ],
        form: {
          category: Field.Select({
            label: context.t("common_fields_category"),
            options: Object.fromEntries(
              Object.values(VineCategory).map((category) => [
                category,
                context.t("viticulture_vine_variety_category_" + category),
              ])
            ),
            required: false,
          }),
          color: Field.Select({
            label: context.t("common_fields_color"),
            options: Object.fromEntries(
              Object.values(VineColor).map((category) => [
                category,
                context.t("viticulture_vine_variety_color_" + category),
              ])
            ),
            required: false,
          }),
        },
        query: VineVarietyTable(sql).select().orderBy("shortName", "ASC"),
        columns: {
          name: context.t("common_fields_name"),
          category: context.t("common_fields_category"),
          color: context.t("common_fields_color"),
          utilities: context.t("viticulture_vine_variety_utilities"),
        },
        handler: (item) => ({
          name: Hypermedia.Text({
            label: context.t("common_fields_name"),
            value: item.longName ? item.longName : item.shortName,
          }),
          category: Hypermedia.Text({
            label: context.t("common_fields_category"),
            value: context.t(
              "viticulture_vine_variety_category_" + item.category
            ),
          }),
          color: item.color
            ? Hypermedia.Text({
                label: context.t("common_fields_color"),
                value: context.t(
                  "viticulture_vine_variety_color_" + item.color
                ),
              })
            : undefined,
          utilities: item.utilities
            ? HypermediaList({
                label: context.t("viticulture_vine_variety_utilities"),
                values: item.utilities.map((utility: string) =>
                  Hypermedia.Text({
                    label: context.t("viticulture_vine_variety_utilities"),
                    value: context.t(
                      "viticulture_vine_variety_utility_" + utility
                    ),
                  })
                ),
              })
            : undefined,
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ minimum: 1, default: 1 }),
        category: t.Optional(t.String({ default: undefined })),
        color: t.Optional(t.String({ default: undefined })),
      }),
    }
  )
  .get("/credits", ({ t }) => Credits({ t }))
  .listen(PORT)

console.log("Lexicon REST API is open on port " + PORT)
console.info("Access the server on http://localhost:" + PORT)
