import { Elysia, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits, CreditTable } from "./namespaces/Credits"
import { useTranslator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import { Hypermedia, HypermediaList, type HypermediaType } from "./Hypermedia"
import { Table } from "./Database"
import { Field } from "./templates/components/Form"
import { Pool } from "pg"
import type { OutputFormat } from "./utils"
import { generateTablePage } from "./generateTablePage"
import { Phytosanitary } from "./namespaces/Phytosanitary"
import { GeographicalReferences } from "./namespaces/GeographicalReferences"
import { AutoList } from "./templates/AutoList"
import { match } from "shulk"
import cors from "@elysiajs/cors"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = parseInt(import.meta.env.DB_PORT as string)
const DB_USER = import.meta.env.DB_USER
const DB_PASSWORD = import.meta.env.DB_PASSWORD
const DB_NAME = import.meta.env.DB_NAME

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
})

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
  .use(cors())
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
      headers["accept-language"]?.split(",")[0]?.split("-")[0] || ""

    const serverLanguage = AVAILABLE_LANGUAGES.includes(clientDesiredLanguage)
      ? (clientDesiredLanguage as string)
      : "fr"

    let output: OutputFormat = "html"
    if (path.endsWith(".json")) {
      output = "json"
    } else if (path.endsWith(".csv")) {
      output = "csv"
    }

    const locale = match(serverLanguage).with({
      fr: "fr-FR",
      en: "en-US",
      _otherwise: "en-US",
    })

    const dateTimeFormatter = {
      DateTime: (date: Date | number) =>
        Intl.DateTimeFormat(locale, {
          // timeZone: timezone,
          dateStyle: "short",
          timeStyle: "short",
        }).format(date),
      Date: (date: Date | number) =>
        Intl.DateTimeFormat(locale, {
          //  timeZone: timezone,
          dateStyle: "short",
        }).format(date),
      Time: (date: Date | number) =>
        Intl.DateTimeFormat(locale, {
          // timeZone: timezone,
          timeStyle: "short",
        }).format(date),
    }

    return {
      output,
      language: serverLanguage,
      t: useTranslator(serverLanguage),
      BREADCRUMBS: [] as HypermediaType["Link"][],
      db: pool,
      dateTimeFormatter,
    }
  })
  .get("/", () => Home())
  .group(
    "",
    {
      query: t.Object({ page: t.Number({ default: 1 }) }),
    },
    (app) => app.use(GeographicalReferences).use(Phytosanitary).use(Credits)
  )
  .get("/viticulture", ({ t }) =>
    AutoList({
      page: {
        title: t("viticulture_title"),
        breadcrumbs: [
          Hypermedia.Link({
            value: t("home_title"),
            method: "GET",
            href: "/",
          }),
        ],
        links: [
          Hypermedia.Link({
            value: t("viticulture_vine_variety_title"),
            method: "GET",
            href: "/viticulture/vine-varieties",
          }),
        ],
      },
    })
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
        query: VineVarietyTable(context.db)
          .select()
          .orderBy("short_name", "ASC"),
        credits: CreditTable(context.db)
          .select()
          .where("datasource", "=", "vine_varieties"),
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
  .get("/datasources", async ({ db }) =>
    console.log(
      (await CreditTable(db).select().run()).map((credits) =>
        credits.map((c) => c.datasource)
      ).val
    )
  )
  .listen(PORT)

console.log("Lexicon REST API is open on port " + PORT)
console.info("Access the server on http://localhost:" + PORT)
