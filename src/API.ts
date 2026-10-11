import { match } from "shulk"
import type { Context } from "./types/Context"
import { applyRequestConfiguration, pool } from "./applyRequestConfiguration"
import { checkAccess, countRequest, startAccessControl } from "./access"
import { OPEN_SCOPE, SELF_CHECKED_SCOPES } from "./access/Plan"
import { callerAddress } from "./access/CallerAddress"
import type { BunRequest } from "bun"
import { ObjectFlatMap, ObjectMap } from "./utils"

type ApiHandler = (cxt: Context) => unknown | Promise<unknown>

const STRUCTURED_OUTPUT = /\.(json|csv|geojson)$/

// Reverse proxies in front of the API whose X-Forwarded-For entries are believed
const TRUSTED_PROXIES = parseInt(import.meta.env.TRUSTED_PROXIES ?? "1")

const FORMAT_VARIANT = /\.(json|csv|geojson)$/

// The data is read from the pages of other sites too: a key narrowed to a domain
// is meant for that. No cookie is ever accepted across sites, so nothing of a
// session can be read this way; the administration and the member area are left out.
const CROSS_ORIGIN_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After",
}
const PREFLIGHT_HEADERS: Record<string, string> = {
  ...CROSS_ORIGIN_HEADERS,
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
}

let servedPaths: string[] = []

/**
 * The paths the API serves, without their format variants.
 */
export function readablePaths(): string[] {
  return servedPaths
}

/**
 * The file of the public folder an address asks for, or undefined when the
 * address tries to leave that folder.
 */
export function publicFileOf(pathname: string): string | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(pathname)
    } catch {
      return undefined
    }
  })()

  return decoded !== undefined &&
    decoded.startsWith("/public/") &&
    !decoded.includes("..") &&
    !decoded.includes("\\") &&
    !decoded.includes("\0")
    ? decoded.slice(1)
    : undefined
}

export class API {
  protected endpoints: Record<string, ApiHandler> = {}
  // Scope a caller needs for each path; a path absent from here is open to all
  protected scopes: Record<string, string> = {}
  protected currentScope = OPEN_SCOPE
  // Reserved pages whose handler knows how to answer a preview to a caller without a key
  protected previews: Record<string, boolean> = {}
  protected currentPreview = false

  protected constructor() {}

  static new() {
    return new this()
  }

  /**
   * The paths declared after this call need the given scope.
   */
  restrictedTo(scope: string, options: { preview?: boolean } = {}) {
    this.currentScope = scope
    // Only say preview when every handler declared after reads `cxt.preview`:
    // one that does not would serve the reserved data whole
    this.currentPreview = options.preview ?? false

    return this
  }

  path(path: string, handler: ApiHandler) {
    const lastPart = path.split("/").pop()

    // A parameter or a wildcard has no format variant
    const lastPartIsParam = lastPart?.startsWith(":") || lastPart === "*"

    const variants = lastPartIsParam
      ? [path]
      : [path, path + ".json", path + ".csv", path + ".geojson"]

    variants.forEach((variant) => {
      this.endpoints[variant] = handler
      this.scopes[variant] = this.currentScope
      // Data formats are never previewed: they stay refused
      this.previews[variant] = this.currentPreview && !FORMAT_VARIANT.test(variant)
    })

    return this
  }

  dump() {
    return ObjectFlatMap(this.endpoints, (key, value) => ({ [key]: value }))
  }

  use(namespace: API) {
    this.endpoints = { ...this.endpoints, ...namespace.dump() }
    this.scopes = { ...this.scopes, ...namespace.scopes }
    this.previews = { ...this.previews, ...namespace.previews }

    return this
  }

  protected callerAddress(
    req: Request,
    server: { requestIP: (req: Request) => { address: string } | null },
  ) {
    return callerAddress(
      req.headers.get("x-forwarded-for"),
      server.requestIP(req)?.address,
      TRUSTED_PROXIES,
    )
  }

  protected refusal(
    path: string,
    status: number,
    message: string,
    headers: Record<string, string>,
  ) {
    return STRUCTURED_OUTPUT.test(path)
      ? Response.json({ error: { status, message } }, { status, headers })
      : new Response(message, {
          status,
          headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        })
  }

  protected cors() {
    return {
      "Access-Control-Allow-Credentials": true,
      "Access-Control-Allow-Headers":
        "host, user-agent, accept, accept-encoding, accept-language, cache-control, dnt, pragma, sec-fetch-dest, sec-fetch-mode, upgrade-insecure-requests, priority, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-site, sec-fetch-user, x-forwarded-for, x-forwarded-host, x-forwarded-port, x-forwarded-proto, x-forwarded-server, x-real-ip",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "host, user-agent, accept, accept-encoding, accept-language, cache-control, dnt, pragma, sec-fetch-dest, sec-fetch-mode, upgrade-insecure-requests, priority, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-site, sec-fetch-user, x-forwarded-for, x-forwarded-host, x-forwarded-port, x-forwarded-proto, x-forwarded-server, x-real-ip",
    }
  }

  async listen(port: string) {
    await startAccessControl(pool)

    servedPaths = Object.keys(this.endpoints)
      .filter((path) => !FORMAT_VARIANT.test(path))
      .sort()

    const server = Bun.serve({
      port: port,
      idleTimeout: 30,

      routes: {
        ...ObjectMap(
          this.endpoints,
          (path, handler) => async (req: BunRequest<any>, server: any) => {
            const isSelfChecked = SELF_CHECKED_SCOPES.includes(this.scopes[path])

            // What a browser asks before sending a key from the page of another site
            if (req.method === "OPTIONS" && !isSelfChecked) {
              return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS })
            }

            // The administration and the contribution tool have their own sessions: neither keys in
            // headers nor rate limits apply to them
            const asked =
              isSelfChecked
                ? undefined
                : await checkAccess(
                    pool,
                    req,
                    this.callerAddress(req, server),
                    this.scopes[path] ?? OPEN_SCOPE,
                  )

            // A visitor without a key on a reserved page gets a preview of it,
            // counted against their allowance as an open page is
            const preview =
              asked !== undefined &&
              !asked.allowed &&
              asked.denial.status === 401 &&
              asked.identity?.kind === "anonymous" &&
              this.previews[path] === true &&
              req.method === "GET"

            const access = preview
              ? await checkAccess(pool, req, this.callerAddress(req, server), OPEN_SCOPE)
              : asked

            if (access !== undefined && !access.allowed) {
              countRequest(access, path, access.denial.status)

              return this.refusal(path, access.denial.status, access.denial.message, {
                ...CROSS_ORIGIN_HEADERS,
                ...access.denial.headers,
              })
            }

            const configured = applyRequestConfiguration(path, req, access?.identity)
            // A preview answers no filter, sort nor page: it could be searched value by value
            const context = preview ? { ...configured, query: {}, preview: true } : configured

            const result = await handler(context)

            const response =
              result instanceof Response
                ? result
                : new Response(result as any, {
                    headers: { "Content-Type": "text/html" },
                  })

            if (access !== undefined) {
              Object.entries({ ...CROSS_ORIGIN_HEADERS, ...access.headers }).forEach(([name, value]) =>
                response.headers.set(name, value),
              )
              countRequest(access, path, response.status)
            }

            return response
          },
        ),

        "/public/*": async (req) => {
          // The query string only serves to get past the cache of browsers
          const parsedPath = publicFileOf(new URL(req.url).pathname)
          const file = parsedPath === undefined ? undefined : Bun.file(parsedPath)

          if (parsedPath === undefined || file === undefined || !(await file.exists())) {
            return new Response("Not Found", { status: 404 })
          }

          const fileExtension = parsedPath.split(".").pop() ?? ""

          const mime = match(fileExtension).with({
            css: "text/css",
            png: "image/png",
            jpg: "image/jpg",
            svg: "image/svg+xml",
            js: "text/javascript; charset=utf-8",
            woff2: "font/woff2",
            ttf: "font/ttf",
            ico: "image/x-icon",
            _otherwise: "text",
          })

          const buffer = await file.bytes()

          return new Response(buffer as any, {
            headers: {
              ...this.cors(),
              "Content-Type": mime,
              "Cache-Control": "public, max-age=86400",
            } as any,
          })
        },
      },

      fetch(req) {
        return new Response("Not Found", { status: 404 })
      },
    })

    console.log("Lexicon REST API is open on port " + port)
    console.info("Access the server on http://localhost:" + port)
  }
}
