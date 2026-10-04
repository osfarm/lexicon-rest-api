import { describe, expect, test } from "bun:test"
import { jsonPathOf } from "../namespaces/Mcp"
import { handleMcpMessage, TOOLS, type McpBackend } from "./Mcp"

const backend = (overrides: Partial<McpBackend> = {}): McpBackend => ({
  version: "1.4.0",
  listDatasets: async () => [{ name: "units" }],
  describeDataset: async (name) => ({ name }),
  listResources: async () => ["/phytosanitary/products"],
  readResource: async (path, query) => ({ path, query }),
  commune: async (inseeCode) => ({ "insee-code": inseeCode }),
  enterprise: async () => {
    throw new Error("This resource needs an API key")
  },
  ...overrides,
})

const call = (name: string, args: object = {}) =>
  handleMcpMessage(
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } },
    backend(),
  )

describe("handleMcpMessage", () => {
  test("initialize agrees on a version and announces tools", async () => {
    const response: any = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      backend(),
    )

    expect(response.id).toBe(1)
    expect(response.result.protocolVersion).toBe("2025-03-26")
    expect(response.result.capabilities).toEqual({ tools: {} })
    expect(response.result.serverInfo.version).toBe("1.4.0")
  })

  test("an unknown protocol version gets the latest one the server speaks", async () => {
    const response: any = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "1999-01-01" },
      },
      backend(),
    )

    expect(response.result.protocolVersion).toBe("2025-06-18")
  })

  test("a notification is not answered", async () => {
    const response = await handleMcpMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      backend(),
    )

    expect(response).toBeUndefined()
  })

  test("tools are listed with a schema each", async () => {
    const response: any = await handleMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      backend(),
    )

    expect(response.result.tools.map((tool: any) => tool.name)).toEqual([
      "list_datasets",
      "describe_dataset",
      "list_resources",
      "read_resource",
      "get_commune",
      "get_enterprise",
    ])
    expect(TOOLS.every((tool) => tool.inputSchema.type === "object")).toBe(true)
  })

  test("a tool call returns its data as text", async () => {
    const response: any = await call("read_resource", {
      path: "/phytosanitary/products",
      query: { page: "2" },
    })

    expect(response.result.isError).toBe(false)
    expect(JSON.parse(response.result.content[0].text)).toEqual({
      path: "/phytosanitary/products",
      query: { page: "2" },
    })
  })

  test("a failing tool is a readable result, not a protocol error", async () => {
    const response: any = await call("get_enterprise", { siren: "662043116" })

    expect(response.error).toBeUndefined()
    expect(response.result.isError).toBe(true)
    expect(response.result.content[0].text).toBe("This resource needs an API key")
  })

  test("a very long answer is cut with a notice", async () => {
    const response: any = await handleMcpMessage(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_datasets" } },
      backend({ listDatasets: async () => "x".repeat(100000) }),
    )

    expect(response.result.content[0].text.length).toBeLessThan(60100)
    expect(response.result.content[0].text).toContain("truncated")
  })

  test("unknown tools and methods are protocol errors", async () => {
    const tool: any = await call("drop_database")
    const method: any = await handleMcpMessage(
      { jsonrpc: "2.0", id: 4, method: "resources/list" },
      backend(),
    )
    const malformed: any = await handleMcpMessage({ id: 5, method: "ping" }, backend())

    expect(tool.error.code).toBe(-32602)
    expect(method.error.code).toBe(-32601)
    expect(malformed.error.code).toBe(-32600)
  })

  test("ping answers an empty result", async () => {
    const response: any = await handleMcpMessage(
      { jsonrpc: "2.0", id: "a", method: "ping" },
      backend(),
    )

    expect(response).toEqual({ jsonrpc: "2.0", id: "a", result: {} })
  })
})

describe("jsonPathOf", () => {
  test("a resource is read in its JSON form", () => {
    expect(jsonPathOf("/phytosanitary/products")).toBe("/phytosanitary/products.json")
    expect(jsonPathOf("/phytosanitary/products.csv")).toBe("/phytosanitary/products.json")
    expect(jsonPathOf("/enterprises/enterprises/662043116")).toBe(
      "/enterprises/enterprises/662043116.json",
    )
  })

  test("administration, bundles and the endpoint itself are closed", () => {
    expect(jsonPathOf("/admin/keys")).toBeUndefined()
    expect(jsonPathOf("/admin")).toBeUndefined()
    expect(jsonPathOf("/bundles/cultia/index.json")).toBeUndefined()
    expect(jsonPathOf("/mcp")).toBeUndefined()
    expect(jsonPathOf("/")).toBeUndefined()
  })

  test("anything that is not a plain path is refused", () => {
    expect(jsonPathOf("http://evil.example/")).toBeUndefined()
    expect(jsonPathOf("/production/../admin/keys")).toBeUndefined()
    expect(jsonPathOf("/production?x=1")).toBeUndefined()
    expect(jsonPathOf("production")).toBeUndefined()
    expect(jsonPathOf("//evil.example/x")).toBeUndefined()
  })
})
