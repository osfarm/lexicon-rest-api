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
  readResource: (
    path: string,
    query: Record<string, string>,
    full: boolean,
  ) => Promise<unknown>
  parcel: (longitude: unknown, latitude: unknown) => Promise<unknown>
  cropFigures: (args: Record<string, unknown>) => Promise<unknown>
  phytosanitaryProducts: (args: Record<string, unknown>) => Promise<unknown>
  phytosanitaryPurchases: (args: Record<string, unknown>) => Promise<unknown>
  commune: (inseeCode: string) => Promise<unknown>
  enterprise: (siren: string) => Promise<unknown>
  searchRdDocuments: (args: Record<string, unknown>) => Promise<unknown>
  rdDocument: (id: string) => Promise<unknown>
  cropHistory: (longitude: unknown, latitude: unknown) => Promise<unknown>
  inputPrices: (args: Record<string, unknown>) => Promise<unknown>
  trainings: (args: Record<string, unknown>) => Promise<unknown>
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
      "Read one page (150 rows) of an API resource. A table comes as rows-total, the names of its filters, its columns, then one array per row. Always filter rather than read page after page: pass the filters in query. A path holding a parameter, such as /weather/stations/:reference, is read with the value in its place.",
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
        full: {
          type: "boolean",
          description:
            "true to get the page as the API serves it, with the label and type of every cell",
        },
      },
      required: ["path"],
    }),
  },
  {
    name: "get_parcel",
    description:
      "Everything the datasets know at a point of metropolitan France: commune, cadastral parcel and its area, crop declared to the CAP and the rotation of the last campaigns, yields of the department, selling price and what Lexicon holds about that crop, soil depth and available water, water nearby (distances in metres), zonings, land transactions, the weather of the last 30 days at the nearest station, farms of the commune; the territorial food projects covering the commune; the farming and food of the commune as get_commune gives them (quality signs, organic farming, farms certified HVE, canteens, agricultural schools); and the zones delimited for wines under AOC that hold the point. Use it for any question about a place given by coordinates.",
    inputSchema: text({
      properties: {
        longitude: { type: "number", description: "Longitude, such as -0.78" },
        latitude: { type: "number", description: "Latitude, such as 45.81" },
      },
      required: ["longitude", "latitude"],
    }),
  },
  {
    name: "get_crop_figures",
    description:
      'Yields (quintals per hectare, by campaign, 2021 onwards) and selling prices of a crop in France, by department. production takes a few French or English words such as "blé tendre", "tournesol" or "maize"; department is a code such as 17. Without a department, yields are averaged over the departments. Prices are few: many are national quotations (zone France). Each production also comes with documentation, the address of its page on the wiki Triple Performance when it has one: give it to who wants to read about growing or raising it.',
    inputSchema: text({
      properties: {
        production: { type: "string", description: "Name of the crop" },
        department: { type: "string", description: "Department code, such as 17 or 2A" },
      },
      required: ["production"],
    }),
  },
  {
    name: "search_phytosanitary_products",
    description:
      'The plant protection products authorised in France (E-Phy), found by what they hold or what they are for: substance ("prosulfocarbe", "glyphosate"), crop as E-Phy names it ("Blé", "Vigne", "Maïs"), target ("pucerons", "désherbage", "mildiou") or product name. Give at least one. Each product comes with its authorisation number, its firm and its substances; with a crop or a target, also the matching usages: dose, days before harvest, untreated buffer from water in metres. total counts every match.',
    inputSchema: text({
      properties: {
        substance: { type: "string", description: "Active substance, French or English" },
        crop: { type: "string", description: "Crop, by its French E-Phy label" },
        target: { type: "string", description: "Pest, disease or purpose, in French" },
        name: { type: "string", description: "Part of the product name" },
        limit: {
          type: "integer",
          description: "Number of products, 10 by default, 20 at most",
        },
      },
    }),
  },
  {
    name: "get_phytosanitary_purchases",
    description:
      'What France bought of an active substance of plant protection products (BNV-D sales, SDES), in kilograms: the total of each of the last five years, and for one year the ten departments and communes that bought most. substance takes a few letters of its name, without accents ("glyphosate", "prosulfocarbe", "soufre"). For what one commune bought, use get_commune. These are purchases estimated at the postal code of the buyer, not uses: say so.',
    inputSchema: text({
      properties: {
        substance: { type: "string", description: "Name of the active substance" },
        year: { type: "integer", description: "Year of the ranking; the latest when absent" },
      },
      required: ["substance"],
    }),
  },
  {
    name: "get_commune",
    description:
      "Everything the datasets know about a French commune, joined in advance: cadastre totals, establishments of every activity, MSA farm chiefs, nearest weather station; and the plant protection products bought there over five years (kilograms of active substance, per hectare of farmland outside grassland, by function and hazard class, the ten substances bought most). These are purchases estimated from sales, not uses: say so. Also its farming and food, each part with a note saying what the figures do not say, to be repeated: quality-signs (areas of AOC/AOP, IGP and IG covering it, with their products; INAO, for information only), organic (operators, farms and organic area year by year, Agence Bio; an area of fewer than three farms is masked and the intercommunality gives the order of magnitude; parcels are counted at the seat of the farm), hve (farms of the HVE directory seated there, a minimum; their names with a member key), canteens (canteens of the national register and the organic share of the purchases they declared; only canteens that declared), agricultural-schools (those of the commune, or the three nearest), territorial-food-projects (PAT covering it).",
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
      "Everything the datasets know about a company (legal entities only): parcels it owns, its establishments, CAP payments. Reserved to members: needs an API key.",
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
  {
    name: "get_crop_history",
    description:
      "The crops declared to the Common Agricultural Policy at a point of metropolitan France, campaign after campaign (2022 onwards): what was grown there each year. Needs coordinates in degrees (WGS 84).",
    inputSchema: text({
      properties: {
        longitude: { type: "number", description: "Longitude, such as -0.78" },
        latitude: { type: "number", description: "Latitude, such as 45.81" },
      },
      required: ["longitude", "latitude"],
    }),
  },
  {
    name: "get_input_price",
    description:
      'The latest price before tax, in euros, of farm inputs in France: plant protection products (by product name, active substance such as "glyphosate", or authorisation number), fertilisers ("ammonitrate", "urée", "18 46"), seeds ("blé tendre", "luzerne"), non-road diesel ("gazole non routier"). Each result gives the price, its unit (liter, kilogram, ton), the date of the price and how it was obtained (observed, estimated, or an older reference price). Give quantity, in the unit of the price, to get the cost: a dose per hectare gives a cost per hectare. Check price-date and stale: many prices are several years old.',
    inputSchema: text({
      properties: {
        query: {
          type: "string",
          description: "A few French or English words naming the input",
        },
        quantity: {
          type: "number",
          description: "Quantity to cost, in the unit of the price, such as 3 for 3 L/ha",
        },
        limit: {
          type: "integer",
          description: "Number of prices, 10 by default, 20 at most",
        },
      },
      required: ["query"],
    }),
  },
  {
    name: "find_agricultural_trainings",
    description:
      'Where a diploma of French agricultural education is prepared (RefEA, ministry of agriculture): schools, apprentice training centres and adult training centres, with their address, telephone, boarding, and the trainings matching. Give a place to get the nearest first (distances in kilometres between centres of communes: a school is placed in its commune, not at its address). diploma is one of "Bac Pro", "CAPA", "BTSA", "BP", "CS", "Bac Techno", "Seconde Pro"…; speciality such as "Viticulture", "Polyculture élevage", "Horticulture", "Grandes cultures"; query matches words of the name of the training. The answer lists every diploma and speciality one can filter by. Forty schools at most.',
    inputSchema: text({
      properties: {
        place: {
          type: "string",
          description: "A commune: INSEE code, postal code or name, such as 17387 or Saintes",
        },
        diploma: { type: "string", description: "Diploma, such as BTSA" },
        speciality: { type: "string", description: "Speciality, such as Viticulture" },
        route: {
          type: "string",
          enum: ["school", "apprenticeship", "continuing", "higher_education"],
          description: "How the training is followed",
        },
        query: { type: "string", description: "Words the name of the training holds" },
        boarding: { type: "boolean", description: "Schools with boarding only" },
      },
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
    read_resource: () =>
      backend.readResource(String(args.path ?? ""), args.query ?? {}, args.full === true),
    get_parcel: () => backend.parcel(args.longitude, args.latitude),
    get_crop_figures: () => backend.cropFigures(args),
    search_phytosanitary_products: () => backend.phytosanitaryProducts(args),
    get_phytosanitary_purchases: () => backend.phytosanitaryPurchases(args),
    get_commune: () => backend.commune(String(args.insee_code ?? "")),
    get_enterprise: () => backend.enterprise(String(args.siren ?? "")),
    search_rd_documents: () => backend.searchRdDocuments(args),
    get_rd_document: () => backend.rdDocument(String(args.id ?? "")),
    get_crop_history: () => backend.cropHistory(args.longitude, args.latitude),
    get_input_price: () => backend.inputPrices(args),
    find_agricultural_trainings: () => backend.trainings(args),
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
        "Lexicon serves French agricultural reference data. Start with list_datasets, then read rows with read_resource. Dedicated tools answer the common questions in one call: get_parcel for a point, get_commune for a commune, get_crop_history for the crops grown at a point, get_crop_figures for yields and selling prices, search_phytosanitary_products for plant protection products, get_phytosanitary_purchases for what is bought of a substance, get_input_price for the price of an input, search_rd_documents for the R&D documents, find_agricultural_trainings for where a diploma is prepared. get_commune and get_parcel also give the quality signs (AOC/AOP, IGP), the organic farming, the farms certified HVE and the canteens of a commune: each of these parts carries a caveat, repeat it with the figures. Every dataset has a licence, given by list_datasets: cite the provider when you use its data.",
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
