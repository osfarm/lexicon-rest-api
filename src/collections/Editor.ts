// The map editor collections are reworked in: geojson.io, built with a free
// background by the `editor` service of the serving stack of the lexicon
// repository, and relayed here so that it lives on the same site as the data
// it reads and writes. It is a static application: nothing of it is secret.

export const SHARED_PATH = "/collections"
export const EDITOR_PATH = "/collections/editor"

const UPSTREAM_TIMEOUT_IN_MS = 15000
const RELAYED_HEADERS = ["content-type", "etag", "last-modified", "content-encoding", "vary"]
// Built files carry a hash in their name and never change; the page itself is asked for again
const HASHED_FILE = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/

type Fetcher = (url: string, init: RequestInit & { decompress?: boolean }) => Promise<Response>

export function editorUrlOf(env: Record<string, string | undefined>): string | undefined {
  const url = (env.EDITOR_URL ?? "").trim().replace(/\/+$/, "")

  return /^https?:\/\/[^/]+/.test(url) ? url : undefined
}

export const EDITOR_URL = editorUrlOf(import.meta.env)

/**
 * The address that opens a collection in the editor, undefined when the editor is not in service.
 * @param base the path the collection answers at: its data under `/data`, what the editor needs under `/session`
 */
export function editorLink(base: string, editorUrl = EDITOR_URL): string | undefined {
  return editorUrl === undefined
    ? undefined
    : `${EDITOR_PATH}/?collecte=${encodeURIComponent(base)}`
}

/**
 * Where a request for a file of the editor goes, undefined for a path that leaves it.
 */
export function editorFileOf(editorUrl: string, requestUrl: string): string | undefined {
  const { pathname } = new URL(requestUrl)
  const inside = pathname === EDITOR_PATH ? "/" : pathname.slice(EDITOR_PATH.length)

  return pathname.startsWith(EDITOR_PATH) &&
    inside.startsWith("/") &&
    !decodeURIComponent(inside).includes("..")
    ? editorUrl + inside
    : undefined
}

export async function relayEditor(
  request: Request,
  editorUrl = EDITOR_URL,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const upstream = editorUrl === undefined ? undefined : editorFileOf(editorUrl, request.url)

  if (upstream === undefined || !["GET", "HEAD"].includes(request.method)) {
    return new Response("Not Found", { status: 404 })
  }

  // The files travel as the editor compressed them for this browser: nothing is unpacked on the way
  const accepted = request.headers.get("accept-encoding")
  const answer = await fetcher(upstream, {
    method: request.method,
    headers: accepted === null ? {} : { "Accept-Encoding": accepted },
    decompress: false,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_IN_MS),
  }).catch(() => undefined)

  if (answer === undefined) {
    return new Response("L'éditeur ne répond pas pour le moment. Réessayez dans un instant.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const headers = new Headers({
    "Cache-Control": HASHED_FILE.test(upstream)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  })
  RELAYED_HEADERS.forEach((name) => {
    const value = answer.headers.get(name)

    if (value !== null) {
      headers.set(name, value)
    }
  })

  return new Response(answer.body, { status: answer.status, headers })
}
