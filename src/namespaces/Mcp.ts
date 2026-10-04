import packageJson from "../../package.json"
import { API, readablePaths } from "../API"
import { MEMBERS_SCOPE } from "../access/Plan"
import { givesScope } from "../access/Scope"
import { readCatalog } from "../catalog/Catalog"
import {
  communeLinkOf,
  enterpriseLinkOf,
  isInseeCode,
  isSiren,
  readCommuneLink,
  readEnterpriseLink,
} from "../links/Links"
import { handleMcpMessage, type McpBackend } from "../mcp/Mcp"
import type { Context } from "../types/Context"

const PORT = import.meta.env.PORT

const RESOURCE_PATH = /^\/[a-z0-9][a-zA-Z0-9/_.:-]*$/

// What a model has no business reading through read_resource
const CLOSED_PREFIXES = ["/admin", "/mcp", "/bundles", "/public", "/documentation"]

const isClosed = (path: string) =>
  path === "/" ||
  CLOSED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"))

/**
 * The path of a resource, as the API serves it in JSON, or undefined when it
 * is not one a tool may read.
 */
export function jsonPathOf(path: string): string | undefined {
  const plain = path.replace(/\.(json|csv|geojson)$/, "")

  return RESOURCE_PATH.test(plain) && !plain.includes("..") && !isClosed(plain)
    ? plain + ".json"
    : undefined
}

// Tables are served as JSON under a text/plain content type: the body decides
function jsonOf(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function backendFor(cxt: Context): McpBackend {
  const required = async <T>(value: T | undefined | null, message: string) => {
    if (value === undefined || value === null) {
      throw new Error(message)
    }

    return value
  }

  return {
    version: packageJson.version,

    listDatasets: async () =>
      (await required(await readCatalog(cxt.db), "The catalogue is not available")).map(
        (dataset) => ({
          name: dataset.name,
          description: dataset.description,
          version: dataset.version,
          provider: dataset.provider,
          licence: dataset.licence,
          "source-date": dataset["source-date"],
          access: dataset.scope === "open" ? "open" : "members",
          rows: dataset.rows,
        }),
      ),

    describeDataset: async (name) =>
      required(
        (await readCatalog(cxt.db))?.find((dataset) => dataset.name === name),
        `No dataset ${name} in service. Use list_datasets to see the names.`,
      ),

    listResources: async () => readablePaths().filter((path) => !isClosed(path)),

    // The resource is asked to the API itself, with the key of the caller: it
    // goes through the same access control as any other request
    readResource: async (path, query) => {
      const jsonPath = await required(
        jsonPathOf(path),
        `${path} is not a readable resource. Use list_resources to see the paths.`,
      )
      const search = new URLSearchParams(query).toString()
      const headers = new Headers({
        "X-Forwarded-For": cxt.identity.caller.replace(/^ip:/, ""),
      })
      const key =
        cxt.request.headers.get("authorization") ?? cxt.request.headers.get("x-api-key")
      if (key !== null) {
        headers.set("Authorization", key.startsWith("Bearer ") ? key : `Bearer ${key}`)
      }

      const response = await fetch(
        `http://127.0.0.1:${PORT}${jsonPath}${search ? "?" + search : ""}`,
        { headers },
      )
      const text = await response.text()

      if (!response.ok) {
        throw new Error(
          jsonOf(text)?.error?.message ??
            (text.length > 0 && text.length < 200 && !text.startsWith("<")
              ? text
              : `The API answered ${response.status}`),
        )
      }

      return required(jsonOf(text), `${path} has no JSON form`)
    },

    commune: async (inseeCode) => {
      if (!isInseeCode(inseeCode)) {
        throw new Error("An INSEE code has five characters, such as 17387 or 2A004")
      }

      return communeLinkOf(
        await required(
          await readCommuneLink(cxt.db, inseeCode),
          `No commune ${inseeCode}`,
        ),
      )
    },

    enterprise: async (siren) => {
      if (!givesScope(cxt.identity.scopes, MEMBERS_SCOPE)) {
        throw new Error("Company records are reserved to members: this needs an API key")
      }
      if (!isSiren(siren)) {
        throw new Error("A SIREN has nine digits")
      }

      return enterpriseLinkOf(
        await required(
          await readEnterpriseLink(cxt.db, siren),
          `No legal entity ${siren} in the records`,
        ),
      )
    },
  }
}

async function mcp(cxt: Context) {
  if (cxt.request.method !== "POST") {
    return new Response("The MCP endpoint takes JSON-RPC messages by POST", {
      status: 405,
      headers: { Allow: "POST" },
    })
  }

  const message = await cxt.request.json().catch(() => undefined)

  if (message === undefined || Array.isArray(message)) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Expected one JSON-RPC message" },
      },
      { status: 400 },
    )
  }

  const response = await handleMcpMessage(message, backendFor(cxt))

  return response === undefined
    ? new Response(null, { status: 202 })
    : Response.json(response)
}

export const Mcp = API.new().path("/mcp", mcp)
