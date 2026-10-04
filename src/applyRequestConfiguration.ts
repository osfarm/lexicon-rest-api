import { match } from "shulk"
import { useTranslator } from "./Translator"
import { Pool } from "pg"
import type { OutputFormat } from "./types/OutputFormat"
import type { Context } from "./types/Context"
import type { BunRequest } from "bun"
import { anonymousIdentity, type Identity } from "./access/AccessControl"

const DB_HOST = import.meta.env.DB_HOST
const DB_PORT = parseInt(import.meta.env.DB_PORT as string)
const DB_USER = import.meta.env.DB_USER
const DB_PASSWORD = import.meta.env.DB_PASSWORD
const DB_NAME = import.meta.env.DB_NAME

// No request holds the database longer than this, whatever it asks for: a
// table being replaced must not wait behind a runaway query
const STATEMENT_TIMEOUT_IN_MS = 30000

export const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  statement_timeout: STATEMENT_TIMEOUT_IN_MS,
})

const AVAILABLE_LANGUAGES = ["fr", "en"]
const DEFAULT_LANGUAGE = "fr"
export const LANGUAGE_COOKIE = "lang"

export const isLanguage = (value: string | undefined): value is string =>
  value !== undefined && AVAILABLE_LANGUAGES.includes(value)

/**
 * The language a request is answered in. The visitor's own choice, kept in a
 * cookie, comes first. Without one, a page is in French; data (JSON, CSV)
 * follows the language the client asks for, as it always did.
 */
export function languageOf(request: {
  cookie: string | undefined
  acceptLanguage: string | undefined
  isPage: boolean
}): string {
  const chosen = request.cookie
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LANGUAGE_COOKIE)?.[1]

  if (isLanguage(chosen)) {
    return chosen
  }
  if (request.isPage) {
    return DEFAULT_LANGUAGE
  }

  const asked = request.acceptLanguage?.split(",")[0]?.split("-")[0]?.trim()

  return isLanguage(asked) ? asked : DEFAULT_LANGUAGE
}

export function applyRequestConfiguration(
  path: string,
  request: BunRequest<"/:id">,
  identity: Identity = anonymousIdentity("unknown"),
): Context {
  const headers = request.headers.toJSON()

  const extension: string | undefined = path.split(".")[1]

  const output: OutputFormat = match(extension).with({
    json: "json",
    geojson: "geojson",
    csv: "csv",
    _otherwise: "html",
  })

  const serverLanguage = languageOf({
    cookie: headers["cookie"],
    acceptLanguage: headers["accept-language"],
    isPage: output === "html",
  })

  const locale = match(serverLanguage).with({
    fr: "fr-FR",
    en: "en-US",
    _otherwise: "en-US",
  })

  // Instantiate formatters once per request rather than on every .format()
  // call (was a hot path: ~8700 calls per parcel-identifier response).
  const dateTimeIntl = Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  })
  const dateIntl = Intl.DateTimeFormat(locale, { dateStyle: "short" })
  const timeIntl = Intl.DateTimeFormat(locale, { timeStyle: "short" })
  const dateTimeFormatter = {
    DateTime: (date: Date | number) => dateTimeIntl.format(date),
    Date: (date: Date | number) => dateIntl.format(date),
    Time: (date: Date | number) => timeIntl.format(date),
  }

  const numberFormatter = Intl.NumberFormat(locale).format

  const url = new URL(request.url)

  return {
    path: url.pathname,
    request: request,
    query: Object.fromEntries(url.searchParams.entries()),
    params: request.params,
    output,
    language: serverLanguage,
    t: useTranslator(serverLanguage),
    db: pool,
    identity,
    dateTimeFormatter,
    numberFormatter,
  }
}
