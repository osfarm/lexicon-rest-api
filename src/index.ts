import { Elysia, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits } from "./templates/Credits"
import { useTranslator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import { Hypermedia, HypermediaList, type HypermediaType } from "./Hypermedia"
import { Table } from "./Database"
import { Field } from "./templates/components/Form"
import { Client } from "pg"
import type { OutputFormat } from "./utils"
import { generateTablePage } from "./generateTablePage"
import { Phytosanitary } from "./namespaces/Phytosanitary"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = parseInt(import.meta.env.DB_PORT as string)
const DB_USER = import.meta.env.DB_USER
const DB_PASSWORD = import.meta.env.DB_PASSWORD
const DB_NAME = import.meta.env.DB_NAME

const db = new Client({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
})
await db.connect()

const PORT = 3000
const AVAILABLE_LANGUAGES = ["fr", "en"]

type VineVariety = {
  id: string
  short_name: string
  long_name?: string
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
  // map: {
  //   id: "id",
  //   shortName: "short_name",
  //   longName: "long_name",
  //   color: "color",
  //   category: "category",
  //   utilities: "utilities",
  // },
})

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
  .derive({ as: "global" }, ({ headers, path }) => {
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
      BREADCRUMBS: [] as HypermediaType["Link"][],
      db,
    }
  })
  .get("/", () => Home())
  .group(
    "",
    {
      query: t.Object({ page: t.Number({ default: 1 }) }),
    },
    (app) => app.use(Phytosanitary)
  )
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
        query: VineVarietyTable(db).select().orderBy("short_name", "ASC"),
        columns: {
          name: context.t("common_fields_name"),
          category: context.t("common_fields_category"),
          color: context.t("common_fields_color"),
          utilities: context.t("viticulture_vine_variety_utilities"),
        },
        handler: (item) => ({
          name: Hypermedia.Text({
            label: context.t("common_fields_name"),
            value: item.long_name ? item.long_name : item.short_name,
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
