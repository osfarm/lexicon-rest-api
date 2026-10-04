import { isLanguage, LANGUAGE_COOKIE } from "./applyRequestConfiguration"
import type { Context } from "./types/Context"

const ONE_YEAR_IN_SECONDS = 365 * 24 * 3600

/**
 * Where a visitor is sent back to after choosing a language: the page they
 * came from, when it is one of this site. Never anywhere else.
 */
export function returnPath(referer: string | null, host: string | null): string {
  const from = referer === null ? null : URL.parse(referer)

  return from !== null && host !== null && from.host === host
    ? from.pathname + from.search
    : "/"
}

/**
 * Keeps the language a visitor chose, then sends them back where they were.
 */
export function chooseLanguage(cxt: Context): Response {
  const code = cxt.params.code

  if (!isLanguage(code)) {
    return new Response("Unknown language", { status: 404 })
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: returnPath(
        cxt.request.headers.get("referer"),
        cxt.request.headers.get("host"),
      ),
      "Set-Cookie": `${LANGUAGE_COOKIE}=${code}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`,
    },
  })
}
