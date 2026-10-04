// The language model, asked through the "chat completions" interface most
// providers share. Nothing here is specific to one of them.

export type ToolCall = Readonly<{
  id: string
  function: { name: string; arguments: string }
}>

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string }

export type ToolDefinition = Readonly<{
  type: "function"
  function: { name: string; description: string; parameters: unknown }
}>

export type Completion = Readonly<{
  content: string
  toolCalls: ToolCall[]
  usage: { input: number; output: number }
}>

export type Provider = (
  messages: ChatMessage[],
  tools: ToolDefinition[],
  // "none" asks for an answer in words even though tools are known
  toolChoice: "auto" | "none",
) => Promise<Completion>

// The provider asks to come back later
export class ProviderBusy extends Error {
  constructor(readonly retryAfterMs: number) {
    super("The model is busy")
  }
}

// The provider cannot be reached, or fails
export class ProviderDown extends Error {}

// The provider refuses the request: asking again would not help
export class ProviderRefusal extends Error {}

export type ProviderSettings = Readonly<{
  url: string
  key: string
  model: string
  maxTokens: number
  timeoutMs: number
}>

const DEFAULT_RETRY_IN_MS = 2000

/**
 * What the provider answered, in the shape the conversation uses.
 */
export function completionOf(body: any): Completion {
  const message = body?.choices?.[0]?.message

  if (message === undefined) {
    throw new ProviderDown("The model answered nothing")
  }

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: (message.tool_calls ?? []).map((call: any) => ({
      id: String(call.id),
      function: {
        name: String(call.function?.name ?? ""),
        arguments:
          typeof call.function?.arguments === "string"
            ? call.function.arguments
            : JSON.stringify(call.function?.arguments ?? {}),
      },
    })),
    usage: {
      input: Number(body.usage?.prompt_tokens ?? 0),
      output: Number(body.usage?.completion_tokens ?? 0),
    },
  }
}

export function httpProvider(
  settings: ProviderSettings,
  send: typeof fetch = fetch,
): Provider {
  return async (messages, tools, toolChoice) => {
    const response = await send(`${settings.url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: toolChoice } : {}),
        max_tokens: settings.maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(settings.timeoutMs),
    }).catch((error: Error) => {
      throw new ProviderDown(error.message)
    })

    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"))

      throw new ProviderBusy(
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_IN_MS,
      )
    }
    if (response.status >= 500) {
      throw new ProviderDown(`The model answered ${response.status}`)
    }
    if (!response.ok) {
      throw new ProviderRefusal(`The model refused the request (${response.status})`)
    }

    return completionOf(await response.json().catch(() => undefined))
  }
}
