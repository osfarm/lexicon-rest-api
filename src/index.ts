import { Elysia, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits, CreditTable } from "./namespaces/Credits"
import { useTranslator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import { Pool } from "pg"
import type { OutputFormat } from "./utils"
import { Phytosanitary } from "./namespaces/Phytosanitary"
import { GeographicalReferences } from "./namespaces/GeographicalReferences"
import { match } from "shulk"
import cors from "@elysiajs/cors"
import { Viticulture } from "./namespaces/Viticulture"
import { Weather } from "./namespaces/Weather"
import { Seed } from "./namespaces/Seed"
import { Production } from "./namespaces/Production"

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

const PORT = import.meta.env.PORT as string
const AVAILABLE_LANGUAGES = ["fr", "en"]

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
      db: pool,
      dateTimeFormatter,
    }
  })
  .get("/", ({ t }) => Home({ t }))
  .group(
    "",
    {
      query: t.Object({ page: t.Number({ default: 1 }) }),
    },
    (app) =>
      app
        .use(Production)
        .use(Seed)
        .use(GeographicalReferences)
        .use(Phytosanitary)
        .use(Viticulture)
        .use(Weather)
        .use(Credits)
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
