// The contribution tool served online. The tool itself is the one of the build side (lexicon,
// lib/lexicon/contribution/web), run as a service beside the API: the API checks the key of the visitor,
// kept in a cookie, then relays the request with the name of their workspace. Each key has its own.

export const WORKSHOP_PATH = "/contribute/outil"
export const KEY_COOKIE = "lexicon_contribute"
export const KEY_LIFETIME_IN_S = 12 * 3600

const KEY_FORMAT = /^lex_[a-z0-9]{8}_[A-Za-z0-9]{32}$/

// What the tool is told with each request: who is relaying, and whose workspace it is
export const SECRET_HEADER = "X-Lexicon-Contribute-Secret"
export const WORKSPACE_HEADER = "X-Lexicon-Workspace"

// What the page of the tool sends with each change, and what its answers are read with
const RELAYED_REQUEST_HEADERS = ["content-type", "x-lexicon-token"]
const RELAYED_RESPONSE_HEADERS = ["content-type", "location"]

// Reading a large table takes a while
const UPSTREAM_TIMEOUT_IN_MS = 120000

export type Workshop = Readonly<{ url: string; secret: string }>

/**
 * Where the tool runs, or undefined when this API has none to relay to.
 */
export function workshopOf(env: {
  CONTRIBUTE_URL?: string
  CONTRIBUTE_SECRET?: string
}): Workshop | undefined {
  const url = (env.CONTRIBUTE_URL ?? "").trim().replace(/\/+$/, "")
  const secret = (env.CONTRIBUTE_SECRET ?? "").trim()

  return url === "" || secret === "" ? undefined : { url, secret }
}

export function keyIn(cookieHeader: string | null): string | undefined {
  const cookie = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === KEY_COOKIE)

  return cookie?.[1] && KEY_FORMAT.test(cookie[1]) ? cookie[1] : undefined
}

/**
 * The key stays in a cookie limited to the tool, unreadable by scripts and never sent from another site.
 */
export function keyCookie(key: string, isSecure: boolean): string {
  return [
    `${KEY_COOKIE}=${key}`,
    `Path=${WORKSHOP_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${KEY_LIFETIME_IN_S}`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; ")
}

export function expiredKeyCookie(): string {
  return `${KEY_COOKIE}=; Path=${WORKSHOP_PATH}; HttpOnly; SameSite=Strict; Max-Age=0`
}

/**
 * The address of the tool a request of the site stands for, or undefined when
 * the request is not one of the tool.
 */
export function upstreamOf(workshop: Workshop, requestUrl: string): string | undefined {
  const { pathname, search } = new URL(requestUrl)

  if (pathname !== WORKSHOP_PATH && !pathname.startsWith(WORKSHOP_PATH + "/")) {
    return undefined
  }

  return workshop.url + (pathname.slice(WORKSHOP_PATH.length) || "/") + search
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/**
 * Hands a request to the tool on behalf of a workspace, and gives its answer back.
 */
export async function relay(
  workshop: Workshop,
  request: Request,
  workspace: string,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const upstream = upstreamOf(workshop, request.url)

  if (upstream === undefined) {
    return new Response("Not Found", { status: 404 })
  }

  const headers = new Headers({
    [SECRET_HEADER]: workshop.secret,
    [WORKSPACE_HEADER]: workspace,
  })
  RELAYED_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers.get(name)

    if (value !== null) {
      headers.set(name, value)
    }
  })

  const hasBody = !["GET", "HEAD"].includes(request.method)
  const answer = await fetcher(upstream, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    // A redirection of the tool is for the browser to follow
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_IN_MS),
  }).catch(() => undefined)

  if (answer === undefined) {
    return new Response(
      "L'outil de contribution ne répond pas pour le moment. Réessayez dans un instant.",
      { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    )
  }

  const relayed = new Headers({
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  })
  RELAYED_RESPONSE_HEADERS.forEach((name) => {
    const value = answer.headers.get(name)

    if (value !== null) {
      relayed.set(name, value)
    }
  })

  return new Response(answer.body, { status: answer.status, headers: relayed })
}
