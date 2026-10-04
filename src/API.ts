import { match } from "shulk"
import type { Context } from "./types/Context"
import { applyRequestConfiguration, pool } from "./applyRequestConfiguration"
import { checkAccess, countRequest, startAccessControl } from "./access"
import { ADMIN_SCOPE, OPEN_SCOPE } from "./access/Plan"
import { callerAddress } from "./access/CallerAddress"
import type { BunRequest } from "bun"
import { ObjectFlatMap, ObjectMap } from "./utils"

type ApiHandler = (cxt: Context) => unknown | Promise<unknown>

const STRUCTURED_OUTPUT = /\.(json|csv|geojson)$/

// Reverse proxies in front of the API whose X-Forwarded-For entries are believed
const TRUSTED_PROXIES = parseInt(import.meta.env.TRUSTED_PROXIES ?? "1")

export class API {
  protected endpoints: Record<string, ApiHandler> = {}
  // Scope a caller needs for each path; a path absent from here is open to all
  protected scopes: Record<string, string> = {}
  protected currentScope = OPEN_SCOPE

  protected constructor() {}

  static new() {
    return new this()
  }

  /**
   * The paths declared after this call need the given scope.
   */
  restrictedTo(scope: string) {
    this.currentScope = scope

    return this
  }

  path(path: string, handler: ApiHandler) {
    const lastPart = path.split("/").pop()

    const lastPartIsParam = lastPart?.startsWith(":")

    const variants = lastPartIsParam
      ? [path]
      : [path, path + ".json", path + ".csv", path + ".geojson"]

    variants.forEach((variant) => {
      this.endpoints[variant] = handler
      this.scopes[variant] = this.currentScope
    })

    return this
  }

  dump() {
    return ObjectFlatMap(this.endpoints, (key, value) => ({ [key]: value }))
  }

  use(namespace: API) {
    this.endpoints = { ...this.endpoints, ...namespace.dump() }
    this.scopes = { ...this.scopes, ...namespace.scopes }

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

  protected refusal(path: string, status: number, message: string, headers: Record<string, string>) {
    return STRUCTURED_OUTPUT.test(path)
      ? Response.json({ error: { status, message } }, { status, headers })
      : new Response(message, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } })
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

    const server = Bun.serve({
      port: port,
      idleTimeout: 30,

      routes: {
        ...ObjectMap(
          this.endpoints,
          (path, handler) => async (req: BunRequest<any>, server: any) => {
            // The administration has its own sessions: neither keys nor rate limits apply to it
            const access =
              this.scopes[path] === ADMIN_SCOPE
                ? undefined
                : await checkAccess(
                    pool,
                    req,
                    this.callerAddress(req, server),
                    this.scopes[path] ?? OPEN_SCOPE,
                  )

            if (access !== undefined && !access.allowed) {
              countRequest(access, path, access.denial.status)

              return this.refusal(
                path,
                access.denial.status,
                access.denial.message,
                access.denial.headers,
              )
            }

            const context = applyRequestConfiguration(path, req, access?.identity)

            const result = await handler(context)

            const response =
              result instanceof Response
                ? result
                : new Response(result as any, {
                    headers: { "Content-Type": "text/html" },
                  })

            if (access !== undefined) {
              Object.entries(access.headers).forEach(([name, value]) =>
                response.headers.set(name, value),
              )
              countRequest(access, path, response.status)
            }

            return response
          },
        ),

        "/public/*": async (req) => {
          const [, , , ...path] = req.url.split("/")
          const parsedPath = path.join("/")
          const fileExtension = parsedPath.split(".")[1]

          const mime = match(fileExtension).with({
            css: "text/css",
            png: "image/png",
            jpg: "image/jpg",
            svg: "image/svg+xml",
            ico: "image/x-icon",
            _otherwise: "text",
          })

          const buffer = await Bun.file(parsedPath).bytes()

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
