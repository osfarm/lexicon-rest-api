import { Elysia, file } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import packageJson from "../package.json"
import { Credits } from "./templates/Credits"
import { useTranslator } from "./Translator"
import { staticPlugin } from "@elysiajs/static"
import postgres from "postgres"
import { Hypermedia, HypermediaList } from "./Hypermedia"
import { AutoTable } from "./templates/AutoTable"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = import.meta.env.DB_PORT
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
  .derive(({ headers }) => {
    const clientDesiredLanguage =
      headers["Accept-Language"]?.split(",")[0]?.split("-")[0] || ""

    const serverLanguage = AVAILABLE_LANGUAGES.includes(clientDesiredLanguage)
      ? (clientDesiredLanguage as string)
      : "fr"

    return {
      language: serverLanguage,
      t: useTranslator(serverLanguage),
    }
  })
  .get("/", () => Home())
  .get("/viticulture/vine-varieties", async ({ t }) => {
    const result =
      await sql`SELECT * FROM "lexicon__6_0_0-ekyviti".registered_vine_varieties ORDER BY short_name ASC;`

    console.log(result[0])

    const page = {
      title: t("viticulture_vine_variety_title"),
      breadcrumbs: [
        Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
        Hypermedia.Link({
          value: t("viticulture_title"),
          method: "GET",
          href: "/viticulture/",
        }),
      ],
      fields: {
        name: t("common_fields_name"),
        category: t("common_fields_category"),
        color: t("common_fields_color"),
        utilities: t("viticulture_vine_variety_utilities"),
      },
      items: result.map((item) => ({
        name: Hypermedia.Text({
          label: t("common_fields_name"),
          value: item.long_name ? item.long_name : item.short_name,
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
              values: item.utilities.map((utility) =>
                Hypermedia.Text({
                  label: t("viticulture_vine_variety_utilities"),
                  value: t("viticulture_vine_variety_utility_" + utility),
                })
              ),
            })
          : undefined,
      })),
    }

    return AutoTable({ ...page, t })
  })
  .get("/credits", ({ t }) => Credits({ t }))
  .get("/user/:id", ({ params: { id } }) => id)
  .post("/form", ({ body }) => body)
  .listen(PORT)

console.log("Lexicon REST API is open on port " + PORT)
