import { Elysia, file, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits } from "./templates/Credits"
import { useTranslator, type Translator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import postgres from "postgres"
import {
  Hypermedia,
  hypermedia2csv,
  hypermedia2json,
  HypermediaList,
  type HypermediaType,
} from "./Hypermedia"
import { AutoTable } from "./templates/AutoTable"
import { Concurrently, match } from "shulk"
import { Table } from "./Database"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = parseInt(import.meta.env.DB_PORT as string)
const DB_USER = import.meta.env.DB_USER
const DB_PASSWORD = import.meta.env.DB_PASSWORD
const DB_NAME = import.meta.env.DB_NAME
const DB_SCHEMA = import.meta.env.DB_SCHEMA

const sql = postgres({
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
})

const PORT = 3000
const AVAILABLE_LANGUAGES = ["fr", "en"]

type OutputFormat = "html" | "json" | "csv"

function generateTablePage<T, F extends string>(
  params: {
    title: string
    breadcrumbs: HypermediaType["Link"][]
    page: number
    totalItems: number
    path: string
    items: T[]
    columns: Record<F, string>
    handler: (obj: T) => Record<F, HypermediaType["any"] | undefined>
  },
  t: Translator
) {
  const PER_PAGE = 50

  const totalPages = Math.ceil(params.totalItems / PER_PAGE)

  return {
    title: params.title,
    breadcrumbs: params.breadcrumbs,
    table: {
      columns: params.columns,
      rows: params.items.map(params.handler),
    },
    "items-per-page": PER_PAGE,
    "items-count": params.items.length,
    "items-total": params.totalItems,
    page: params.page,
    "total-pages": totalPages,
    navigation: {
      "previous-page":
        params.page > 1
          ? Hypermedia.Link({
              value: t("navigation_previous_page"),
              method: "GET",
              href: params.path + `?page=${params.page - 1}`,
            })
          : undefined,
      "next-page":
        params.page < totalPages
          ? Hypermedia.Link({
              value: t("navigation_next_page"),
              method: "GET",
              href: params.path + `?page=${params.page + 1}`,
            })
          : undefined,
    },
  }
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
    async ({ request, path, query, output, t }) => {
      type VineVariety = {
        id: string
        shortName: string
        longName?: string
        category: string
        color?: string
        utilities?: string[]
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

      const { page } = query

      const q = VineVarietyTable(sql)
        .select()
        .orderBy("shortName", "ASC")
        .limit(50)
        .offset((page - 1) * 50)

      // prettier-ignore
      const result = await Concurrently
        .run(() => q.run())
        .and(() => q.count())
        .done()

      const pageData = result.map(([items, total]) =>
        generateTablePage(
          {
            title: t("viticulture_vine_variety_title"),
            breadcrumbs: [
              Hypermedia.Link({
                value: t("home_title"),
                method: "GET",
                href: "/",
              }),
              Hypermedia.Link({
                value: t("viticulture_title"),
                method: "GET",
                href: "/viticulture/",
              }),
            ],
            page,
            path: path,
            totalItems: total,
            items: items,
            columns: {
              name: t("common_fields_name"),
              category: t("common_fields_category"),
              color: t("common_fields_color"),
              utilities: t("viticulture_vine_variety_utilities"),
            },
            handler: (item) => ({
              name: Hypermedia.Text({
                label: t("common_fields_name"),
                value: item.longName ? item.longName : item.shortName,
              }),
              category: Hypermedia.Text({
                label: t("common_fields_category"),
                value: t("viticulture_vine_variety_category_" + item.category),
              }),
              color: item.color
                ? Hypermedia.Text({
                    label: t("common_fields_color"),
                    value: t("viticulture_vine_variety_color_" + item.color),
                  })
                : undefined,
              utilities: item.utilities
                ? HypermediaList({
                    label: t("viticulture_vine_variety_utilities"),
                    values: item.utilities.map((utility: string) =>
                      Hypermedia.Text({
                        label: t("viticulture_vine_variety_utilities"),
                        value: t("viticulture_vine_variety_utility_" + utility),
                      })
                    ),
                  })
                : undefined,
            }),
          },
          t
        )
      )

      return match(output)
        .returnType<string | object>()
        .case({
          html: () => AutoTable({ page: pageData, t }),
          json: () => hypermedia2json(request, pageData.val),
          csv: () => hypermedia2csv(pageData.val),
        })
    },
    {
      query: t.Object({
        page: t.Number({ minimum: 1, default: 1 }),
      }),
    }
  )
  .get("/credits", ({ t }) => Credits({ t }))
  .listen(PORT)

console.log("Lexicon REST API is open on port " + PORT)
console.info("Access the server on http://localhost:" + PORT)
