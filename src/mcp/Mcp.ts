// A Model Context Protocol server over the API, in its stateless form: each
// POST carries one JSON-RPC message and gets one JSON answer.

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const

const MAX_TEXT_LENGTH = 60000

type JsonRpcId = string | number | null

export type JsonRpcMessage = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, any>
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } }

/**
 * What the tools need from the API. Each function answers with data to hand to
 * the model, or throws an error whose message is safe to show.
 */
export type McpBackend = Readonly<{
  version: string
  listDatasets: () => Promise<unknown>
  describeDataset: (name: string) => Promise<unknown>
  listResources: () => Promise<unknown>
  readResource: (path: string, query: Record<string, string>) => Promise<unknown>
  commune: (inseeCode: string) => Promise<unknown>
  enterprise: (siren: string) => Promise<unknown>
  searchRdDocuments: (args: Record<string, unknown>) => Promise<unknown>
  rdDocument: (id: string) => Promise<unknown>
}>

const text = (schema: object) => ({
  type: "object",
  additionalProperties: false,
  ...schema,
})

export const TOOLS = [
  {
    name: "list_datasets",
    description:
      "List the reference datasets Lexicon serves (French agricultural open data): name, description, version, provider, licence, date of the source, and whether it is open or reserved to members.",
    inputSchema: text({ properties: {} }),
  },
  {
    name: "describe_dataset",
    description:
      "Describe one dataset: its tables and row counts, what it depends on, its linking keys with their match rates, and the versions that can be downloaded.",
    inputSchema: text({
      properties: {
        name: { type: "string", description: "Dataset name, as given by list_datasets" },
      },
      required: ["name"],
    }),
  },
  {
    name: "list_resources",
    description:
      "List the paths of the API that can be read with read_resource, such as /phytosanitary/products or /geographical-references/municipalities.",
    inputSchema: text({ properties: {} }),
  },
  {
    name: "read_resource",
    description:
      "Read one page (150 rows) of an API resource as JSON. Filters are passed in query; use page to get the following rows.",
    inputSchema: text({
      properties: {
        path: {
          type: "string",
          description: "Path given by list_resources, without extension",
        },
        query: {
          type: "object",
          description: 'Filters and page number, for instance {"page": "2"}',
          additionalProperties: { type: "string" },
        },
      },
      required: ["path"],
    }),
  },
  {
    name: "get_commune",
    description:
      "Everything the datasets know about a French commune, joined in advance: cadastre totals, agricultural enterprises, MSA farm chiefs, nearest weather station.",
    inputSchema: text({
      properties: {
        insee_code: { type: "string", description: "INSEE code, such as 17387 or 2A004" },
      },
      required: ["insee_code"],
    }),
  },
  {
    name: "get_enterprise",
    description:
      "Everything the datasets know about a company (legal entities only): parcels it owns, agricultural establishments, CAP payments. Reserved to members: needs an API key.",
    inputSchema: text({
      properties: { siren: { type: "string", description: "SIREN, nine digits" } },
      required: ["siren"],
    }),
  },
  {
    name: "search_rd_documents",
    description:
      'Search the documents of the French agricultural R&D platform (rd-agri.fr): trial reports, technical guides, articles, videos. Put everything in query, as a few short French keywords such as "mildiou vigne bio cuivre". The other arguments are filters that few documents match: leave them out at first, and add one only to narrow down too many results. Each result has a title, a year, a publisher, an excerpt and the address of the source.',
    inputSchema: text({
      properties: {
        query: { type: "string", description: "French keywords" },
        production: {
          type: "string",
          description:
            "Reference name of a production, as found in /production/productions",
        },
        taxon: { type: "string", description: "Reference name of a taxon" },
        pest: { type: "string", description: "Pest or disease, by its French label" },
        production_system: {
          type: "string",
          description:
            "Only the documents explicitly linked to a production system: organic_farming, conservation_agriculture, sustainable_agriculture or intensive_farming",
        },
        year_from: { type: "integer", description: "Published this year or later" },
        year_to: { type: "integer", description: "Published this year or earlier" },
        limit: {
          type: "integer",
          description: "Number of documents, 10 by default, 20 at most",
        },
      },
      required: ["query"],
    }),
  },
  {
    name: "get_rd_document",
    description:
      "One document of the agricultural R&D platform, with its full description and what it is linked to: productions, taxa, regions, production systems, pests.",
    inputSchema: text({
      properties: {
        id: { type: "string", description: "Identifier given by search_rd_documents" },
      },
      required: ["id"],
    }),
  },
] as const

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value }
}

function failure(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function toolContent(value: unknown, isError = false) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  const shown =
    serialized.length > MAX_TEXT_LENGTH
      ? serialized.slice(0, MAX_TEXT_LENGTH) + "\n… (truncated: ask for a narrower query)"
      : serialized

  return { content: [{ type: "text", text: shown }], isError }
}

function callTool(backend: McpBackend, name: string, args: Record<string, any>) {
  const calls: Record<string, () => Promise<unknown>> = {
    list_datasets: () => backend.listDatasets(),
    describe_dataset: () => backend.describeDataset(String(args.name ?? "")),
    list_resources: () => backend.listResources(),
    read_resource: () => backend.readResource(String(args.path ?? ""), args.query ?? {}),
    get_commune: () => backend.commune(String(args.insee_code ?? "")),
    get_enterprise: () => backend.enterprise(String(args.siren ?? "")),
    search_rd_documents: () => backend.searchRdDocuments(args),
    get_rd_document: () => backend.rdDocument(String(args.id ?? "")),
  }

  return calls[name]
}

/**
 * Answers one JSON-RPC message of the protocol.
 *
 * @returns the response, or undefined for a notification, which expects none
 */
export async function handleMcpMessage(
  message: JsonRpcMessage,
  backend: McpBackend,
): Promise<JsonRpcResponse | undefined> {
  const id = message.id ?? null

  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return failure(id, -32600, "Not a JSON-RPC 2.0 request")
  }
  // A message without id is a notification: nothing is answered
  if (message.id === undefined) {
    return undefined
  }

  if (message.method === "initialize") {
    const asked = message.params?.protocolVersion

    return result(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "lexicon", title: "Lexicon", version: backend.version },
      instructions:
        "Lexicon serves French agricultural reference data. Start with list_datasets, then read rows with read_resource, get a pre-joined record with get_commune, or search the R&D documents with search_rd_documents. Every dataset has a licence, given by list_datasets: cite the provider when you use its data.",
    })
  }
  if (message.method === "ping") {
    return result(id, {})
  }
  if (message.method === "tools/list") {
    return result(id, { tools: TOOLS })
  }
  if (message.method === "tools/call") {
    const call = callTool(backend, message.params?.name, message.params?.arguments ?? {})

    if (call === undefined) {
      return failure(id, -32602, `Unknown tool: ${message.params?.name}`)
    }

    // A tool that fails is a result the model can read and react to, not a protocol error
    return call().then(
      (value) => result(id, toolContent(value)),
      (error: Error) => result(id, toolContent(error.message, true)),
    )
  }

  return failure(id, -32601, `Method not found: ${message.method}`)
}
