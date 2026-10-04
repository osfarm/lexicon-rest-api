import type { JsonRpcMessage, JsonRpcResponse } from "../mcp/Mcp"
import type { ToolDefinition } from "./Provider"

// A client of the Model Context Protocol: it only knows the messages of the
// protocol, not the server that answers them.

export type McpTransport = (
  message: JsonRpcMessage,
) => Promise<JsonRpcResponse | undefined>

export type ToolOutcome = Readonly<{ text: string; isError: boolean }>

export type McpClient = Readonly<{
  tools: () => Promise<ToolDefinition[]>
  call: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>
}>

export function mcpClient(transport: McpTransport): McpClient {
  // Not a constant: two requests must not share their identifiers
  const counter = { next: 1 }

  const request = async (method: string, params?: Record<string, any>) => {
    const response = await transport({
      jsonrpc: "2.0",
      id: counter.next++,
      method,
      params,
    })

    if (response === undefined) {
      throw new Error(`The MCP server did not answer ${method}`)
    }
    if ("error" in response) {
      throw new Error(response.error.message)
    }

    return response.result as any
  }

  return {
    tools: async () =>
      ((await request("tools/list")).tools as any[]).map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),

    call: async (name, args) => {
      try {
        const result = await request("tools/call", { name, arguments: args })

        return {
          text: (result.content ?? [])
            .map((part: any) => (part.type === "text" ? part.text : ""))
            .join("\n"),
          isError: result.isError === true,
        }
      } catch (error) {
        // An unknown tool is the model's mistake: it is told, and can try another
        return { text: (error as Error).message, isError: true }
      }
    },
  }
}
