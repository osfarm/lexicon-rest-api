import { match } from "shulk"
import type { Context } from "./types/Context"
import { applyRequestConfiguration } from "./applyRequestConfiguration"
import type { BunRequest } from "bun"
import { ObjectFlatMap, ObjectMap } from "./utils"

type ApiHandler = (cxt: Context) => unknown | Promise<unknown>

export class API {
  protected endpoints: Record<string, ApiHandler> = {}

  protected constructor() {}

  static new() {
    return new this()
  }

  path(path: string, handler: ApiHandler) {
    const lastPart = path.split("/").pop()

    const lastPartIsParam = lastPart?.startsWith(":")

    this.endpoints[path] = handler

    if (lastPartIsParam) {
      return this
    } else {
      this.endpoints[path + ".json"] = handler
      this.endpoints[path + ".csv"] = handler
      this.endpoints[path + ".geojson"] = handler
      return this
    }
  }

  dump() {
    return ObjectFlatMap(this.endpoints, (key, value) => ({ [key]: value }))
  }

  use(namespace: API) {
    this.endpoints = { ...this.endpoints, ...namespace.dump() }

    return this
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

  listen(port: string) {
    const server = Bun.serve({
      port: port,
      idleTimeout: 30,

      routes: {
        ...ObjectMap(this.endpoints, (path, handler) => async (req: BunRequest<any>) => {
          const context = applyRequestConfiguration(path, req)

          const result = await handler(context)

          if (result instanceof Response) {
            return result
          } else {
            return new Response(result as any, {
              headers: { "Content-Type": "text/html" },
            })
          }
        }),

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
