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
        "Lexicon serves French agricultural reference data. Start with list_datasets, then read rows with read_resource or get a pre-joined record with get_commune. Every dataset has a licence, given by list_datasets: cite the provider when you use its data.",
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
