import { match } from "shulk"
import { useTranslator } from "./Translator"
import { Pool } from "pg"

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

const AVAILABLE_LANGUAGES = ["fr", "en"]

export function applyRequestConfiguration(req: {
  headers: Record<string, string | undefined>
  path: string
}) {
  const { headers, path } = req

  const clientDesiredLanguage =
    headers["accept-language"]?.split(",")[0]?.split("-")[0] || ""

  const serverLanguage = AVAILABLE_LANGUAGES.includes(clientDesiredLanguage)
    ? (clientDesiredLanguage as string)
    : "fr"

  const locale = match(serverLanguage).with({
    fr: "fr-FR",
    en: "en-US",
    _otherwise: "en-US",
  })

  const extension: string | undefined = path.split(".")[1]

  const output = match(extension).with({
    json: "json",
    csv: "csv",
    _otherwise: "html",
  })

  const dateTimeFormatter = {
    DateTime: (date: Date | number) =>
      Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date),
    Date: (date: Date | number) =>
      Intl.DateTimeFormat(locale, {
        dateStyle: "short",
      }).format(date),
    Time: (date: Date | number) =>
      Intl.DateTimeFormat(locale, {
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
}
