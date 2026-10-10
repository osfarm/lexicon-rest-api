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
  readCapYears,
  readEnterpriseLink,
} from "../links/Links"
import { handleMcpMessage, type McpBackend } from "../mcp/Mcp"
import { compactPage } from "../mcp/Compact"
import { parcelSummaryOf } from "../mcp/Parcel"
import { cropFigures, figuresQueryOf } from "../crop-figures/CropFigures"
import { productQueryOf, searchProducts } from "../phytosanitary/ProductSearch"
import {
  communePurchases,
  PURCHASES_CAVEAT,
  substancePurchases,
  substanceQueryOf,
} from "../phytosanitary/Purchases"
import { coordinatesOf, cropHistoryAt } from "../cap-history/CapHistory"
import {
  priceQueryOf,
  searchInputPrices,
  unpricedProducts,
} from "../input-prices/InputPrices"
import { filtersOf, readDocument, searchDocuments } from "../rd-agri/RdAgri"
import type { Context } from "../types/Context"

const PORT = import.meta.env.PORT

const RESOURCE_PATH = /^\/[a-z0-9][a-zA-Z0-9/_.:-]*$/

// What a model has no business reading through read_resource
const CLOSED_PREFIXES = [
  "/admin",
  "/mcp",
  "/bundles",
  "/public",
  "/documentation",
  "/contribute/outil",
]

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

/**
 * What the tools of the MCP server do for this caller: they read no more than
 * the caller could through the API.
 */
export function backendFor(cxt: Context): McpBackend {
  const required = async <T>(value: T | undefined | null, message: string) => {
    if (value === undefined || value === null) {
      throw new Error(message)
    }

    return value
  }

  // A resource is asked to the API itself, with the key of the caller: it
  // goes through the same access control as any other request
  const read = async (path: string, query: Record<string, string>) => {
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

    readResource: async (path, query, full) => {
      const page = await read(path, query)

      return full ? page : compactPage(page)
    },

    parcel: async (longitude, latitude) => {
      const point = await required(
        coordinatesOf({ longitude, latitude }),
        "A point is needed: longitude and latitude, in degrees (WGS 84)",
      )
      const page = await read("/tools/parcel-identifier", {
        longitude: String(point.longitude),
        latitude: String(point.latitude),
      })
      const summary = parcelSummaryOf(page)

      // A weather station is always found, however far: a place is known by
      // its commune or its parcels
      if (!["commune", "cadastral-parcel", "cap-parcel"].some((part) => part in summary)) {
        throw new Error(
          "Lexicon knows nothing at this point: it covers metropolitan France. Check that longitude and latitude are not swapped.",
        )
      }

      return summary
    },

    cropFigures: async (args) => {
      const asked = await required(
        figuresQueryOf(args),
        "A production is needed: a few words naming the crop, such as blé tendre",
      )
      const figures = await required(
        await cropFigures(cxt.db, asked),
        "The productions are not in service",
      )

      if (figures.productions.length === 0) {
        throw new Error(
          `No production named ${asked.production}. Try a shorter French name, or read /production/productions.`,
        )
      }

      return {
        ...figures,
        note: "Yields: Agreste, by department. Prices before tax. Source: Lexicon OSFarm, dataset productions.",
      }
    },

    phytosanitaryProducts: async (args) => {
      const asked = await required(
        productQueryOf(args),
        "Give at least one of substance, crop, target or name",
      )

      return {
        ...(await required(
          await searchProducts(cxt.db, asked),
          "The plant protection products are not in service",
        )),
        note: "Authorised products only. Source: E-Phy (ANSES), through Lexicon OSFarm.",
      }
    },

    commune: async (inseeCode) => {
      if (!isInseeCode(inseeCode)) {
        throw new Error("An INSEE code has five characters, such as 17387 or 2A004")
      }

      const link = communeLinkOf(
        await required(
          await readCommuneLink(cxt.db, inseeCode),
          `No commune ${inseeCode}`,
        ),
      )
      const purchases = await communePurchases(cxt.db, inseeCode)

      return purchases === undefined
        ? link
        : {
            ...link,
            "phytosanitary-purchases-kg-of-active-substance": {
              ...purchases,
              note: PURCHASES_CAVEAT,
            },
          }
    },

    phytosanitaryPurchases: async (args) => {
      const asked = await required(
        substanceQueryOf(args),
        "A substance is needed: a few letters of its name, such as glyphosate",
      )
      const purchases = await required(
        await substancePurchases(cxt.db, asked),
        "The purchases of plant protection products are not in service",
      )

      if (purchases.substance === undefined) {
        throw new Error(
          `No substance named ${asked.substance} among the purchases. Names are in French without accents; read /phytosanitary/substance-purchases for the list.`,
        )
      }

      return { ...purchases, note: PURCHASES_CAVEAT }
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
        await readCapYears(cxt.db, siren),
      )
    },

    searchRdDocuments: async (args) => {
      const filters = filtersOf({
        q: args.query,
        production: args.production,
        taxon: args.taxon,
        pest: args.pest,
        "production-system": args.production_system,
        "year-from": args.year_from,
        "year-to": args.year_to,
      })
      if (filters.q === undefined) {
        throw new Error("A search needs a query: a few French keywords")
      }
      const asked = Number(args.limit)
      const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 20) : 10
      const page = { limit, offset: 0 }
      const found = await required(
        await searchDocuments(cxt.db, filters, page),
        "The R&D documents are not in service",
      )
      const { q, "year-from": yearFrom, "year-to": yearTo, ...references } = filters

      if (found.total > 0 || Object.keys(references).length === 0) {
        return found
      }

      // Few documents are linked to a reference, and a model easily makes one up:
      // rather than nothing, the search is given again on its words and years alone
      const wider = await searchDocuments(
        cxt.db,
        filtersOf({ q, "year-from": yearFrom, "year-to": yearTo }),
        page,
      )

      return {
        ...(wider ?? found),
        "filters-ignored": Object.keys(references).map((name) => name.replace("-", "_")),
      }
    },

    rdDocument: async (id) => {
      const document = await readDocument(cxt.db, id)

      if (document === undefined) {
        throw new Error("The R&D documents are not in service")
      }

      return required(
        document,
        `No document ${id}. Use search_rd_documents to find identifiers.`,
      )
    },

    cropHistory: async (longitude, latitude) => {
      const point = await required(
        coordinatesOf({ longitude, latitude }),
        "A point is needed: longitude and latitude, in degrees (WGS 84)",
      )
      const campaigns = await required(
        await cropHistoryAt(cxt.db, point),
        "The CAP parcels are not in service",
      )

      return { ...point, campaigns }
    },

    inputPrices: async (args) => {
      const asked = await required(
        priceQueryOf(args),
        "A query is needed: a few words naming the input, such as glyphosate or ammonitrate",
      )
      const prices = await required(
        await searchInputPrices(cxt.db, asked),
        "The prices of inputs are not in service",
      )

      // Few plant protection products have a price: say which ones were found without any
      const unpriced =
        prices.length === 0 ? await unpricedProducts(cxt.db, asked) : undefined

      return {
        query: asked.query,
        ...(asked.quantity === undefined ? {} : { quantity: asked.quantity }),
        prices,
        ...(unpriced && unpriced.count > 0
          ? {
              "without-price": {
                ...unpriced,
                meaning:
                  "Authorised plant protection products matching the query, for which Lexicon has no price",
              },
            }
          : {}),
        note: "Prices before tax, metropolitan France. A negotiated price is the one of a purchasing group. Source: Lexicon OSFarm, dataset prices.",
      }
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
