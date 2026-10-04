import type { McpClient } from "./McpClient"
import { instructionsFor, type AssistantLanguage } from "./Prompt"
import type { ChatMessage, Provider } from "./Provider"

// One question to the assistant: the model is asked, calls tools of the MCP
// server as long as it needs to, then answers. Knows nothing of HTTP, of the
// provider or of the database.

export type Turn = Readonly<{ question: string; answer: string }>

export type Source = Readonly<{
  id: string
  title: string
  year: number | null
  url: string
  href: string
}>

export type AssistantEvent =
  | { type: "waiting"; ahead: number }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; name: string; size: number; isError: boolean; excerpt: string }
  | { type: "answer"; text: string }
  | { type: "sources"; documents: Source[] }
  | { type: "error"; code: string; message: string }
  | { type: "done"; rounds: number; toolCalls: number }

export type Limits = Readonly<{
  questionLength: number
  rounds: number
  toolCalls: number
  toolResultLength: number
  historyTurns: number
  historyLength: number
  durationMs: number
}>

export const DEFAULT_LIMITS: Limits = {
  questionLength: 500,
  rounds: 6,
  toolCalls: 8,
  toolResultLength: 8000,
  historyTurns: 3,
  historyLength: 6000,
  durationMs: 90000,
}

export type Outcome = Readonly<{
  answered: boolean
  rounds: number
  toolCalls: number
  usage: { input: number; output: number }
}>

const EXCERPT_LENGTH = 200
const MAX_SOURCES = 5

/**
 * The earlier turns a browser sends back, kept only when they are what they
 * should be: a few short texts.
 */
export function historyOf(input: unknown, limits: Limits): Turn[] {
  if (!Array.isArray(input)) {
    return []
  }

  const turns = input
    .filter(
      (turn): turn is Turn =>
        typeof turn?.question === "string" && typeof turn?.answer === "string",
    )
    .map((turn) => ({ question: turn.question, answer: turn.answer }))
    .slice(-limits.historyTurns)

  const length = turns.reduce(
    (sum, turn) => sum + turn.question.length + turn.answer.length,
    0,
  )

  return length > limits.historyLength ? [] : turns
}

/**
 * The documents a tool result speaks of, when it is one of the R&D tools.
 */
export function sourcesOf(toolName: string, text: string): Source[] {
  if (toolName !== "search_rd_documents" && toolName !== "get_rd_document") {
    return []
  }

  try {
    const data = JSON.parse(text)
    const documents: any[] = Array.isArray(data.documents) ? data.documents : [data]

    return documents
      .filter(
        (document) =>
          typeof document?.id === "string" &&
          typeof document?.title === "string" &&
          typeof document?.url === "string",
      )
      .map((document) => ({
        id: document.id,
        title: document.title,
        year: typeof document.year === "number" ? document.year : null,
        url: document.url,
        href: `/rd-agri/documents/${encodeURIComponent(document.id)}`,
      }))
  } catch {
    // A result cut short is not JSON any more: it names no source
    return []
  }
}

/**
 * The documents to show under an answer: those it names, or failing that the
 * first ones the tools found.
 */
export function citedSources(answer: string, seen: Source[]): Source[] {
  const unique = [...new Map(seen.map((source) => [source.id, source])).values()]
  const plain = answer.toLowerCase()
  const named = unique.filter(
    (source) =>
      plain.includes(source.title.toLowerCase().slice(0, 40)) ||
      plain.includes(source.id.toLowerCase()),
  )

  return (named.length > 0 ? named : unique).slice(0, MAX_SOURCES)
}

/**
 * An answer without the Markdown a model writes whatever it is told: the page shows plain text.
 */
export function plainText(answer: string): string {
  return answer
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/gm, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .trim()
}

const argumentsOf = (json: string): Record<string, unknown> | undefined => {
  try {
    const value = JSON.parse(json)

    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export async function converse(
  input: { history: Turn[]; question: string; language: AssistantLanguage },
  deps: { provider: Provider; mcp: McpClient; limits: Limits; now?: () => number },
  emit: (event: AssistantEvent) => void,
): Promise<Outcome> {
  const { provider, mcp, limits } = deps
  const now = deps.now ?? Date.now
  const deadline = now() + limits.durationMs
  const tools = await mcp.tools()

  const messages: ChatMessage[] = [
    { role: "system", content: instructionsFor(input.language) },
    ...input.history.flatMap((turn): ChatMessage[] => [
      { role: "user", content: turn.question },
      { role: "assistant", content: turn.answer },
    ]),
    { role: "user", content: input.question },
  ]
  const seen: Source[] = []
  const usage = { input: 0, output: 0 }
  const count = { rounds: 0, toolCalls: 0 }

  const finish = (answer: string): Outcome => {
    const text = plainText(answer)

    if (text === "") {
      emit({ type: "error", code: "limit", message: "The model gave no answer" })
    } else {
      emit({ type: "answer", text })
      emit({ type: "sources", documents: citedSources(text, seen) })
    }
    emit({ type: "done", ...count })

    return { answered: text !== "", ...count, usage }
  }

  while (true) {
    count.rounds += 1

    // Out of rounds, of tool calls or of time: the model must answer with what it has
    const mayCallTools =
      count.rounds < limits.rounds &&
      count.toolCalls < limits.toolCalls &&
      now() < deadline
    const completion = await provider(messages, tools, mayCallTools ? "auto" : "none")

    usage.input += completion.usage.input
    usage.output += completion.usage.output

    if (completion.toolCalls.length === 0 || !mayCallTools) {
      return finish(completion.content)
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      tool_calls: completion.toolCalls,
    })

    for (const call of completion.toolCalls) {
      const name = call.function.name
      const args = argumentsOf(call.function.arguments)
      const answer = (content: string) =>
        messages.push({ role: "tool", tool_call_id: call.id, name, content })

      if (count.toolCalls >= limits.toolCalls) {
        answer("No more tool calls are allowed for this question.")
        continue
      }
      if (args === undefined) {
        answer("The arguments of this call are not a JSON object.")
        continue
      }

      count.toolCalls += 1
      emit({ type: "tool_call", name, arguments: args })

      const result = await mcp.call(name, args)

      emit({
        type: "tool_result",
        name,
        size: result.text.length,
        isError: result.isError,
        excerpt: result.text.slice(0, EXCERPT_LENGTH),
      })
      if (!result.isError) {
        seen.push(...sourcesOf(name, result.text))
      }
      answer(result.text.slice(0, limits.toolResultLength))
    }
  }
}
