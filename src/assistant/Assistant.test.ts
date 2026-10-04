import { describe, expect, test } from "bun:test"
import { handleMcpMessage, type McpBackend } from "../mcp/Mcp"
import {
  emptyAllowance,
  giveBackQuestion,
  remaining,
  restoreTotal,
  takeQuestion,
} from "./Allowance"
import { isModelName, settingsOf } from "./AssistantStore"
import {
  citedSources,
  converse,
  DEFAULT_LIMITS,
  historyOf,
  plainText,
  sourcesOf,
  type AssistantEvent,
} from "./Conversation"
import { mcpClient } from "./McpClient"
import {
  completionOf,
  httpProvider,
  ProviderBusy,
  ProviderDown,
  ProviderRefusal,
  type Completion,
  type Provider,
} from "./Provider"
import { emptyQueue, enqueue, QueueFull } from "./ProviderQueue"

const DOCUMENT = {
  id: "itab_243",
  title: "Lutte contre le mildiou : utilisation du cuivre",
  year: 2022,
  url: "https://rd-agri.fr/detail/itab_243",
}

const backend: McpBackend = {
  version: "1.4.0",
  listDatasets: async () => [],
  describeDataset: async () => ({}),
  listResources: async () => [],
  readResource: async () => ({}),
  commune: async () => ({}),
  enterprise: async () => {
    throw new Error("This needs an API key")
  },
  searchRdDocuments: async () => ({ total: 1, documents: [DOCUMENT] }),
  rdDocument: async () => DOCUMENT,
}

const mcp = mcpClient((message) => handleMcpMessage(message, backend))

const answer = (content: string): Completion => ({
  content,
  toolCalls: [],
  usage: { input: 10, output: 5 },
})

const toolCall = (name: string, args: string, id = "c1"): Completion => ({
  content: "",
  toolCalls: [{ id, function: { name, arguments: args } }],
  usage: { input: 10, output: 5 },
})

// A provider that plays the given completions in turn, and keeps what it was asked
function scripted(completions: Completion[]) {
  const asked: { roles: string[]; toolChoice: string }[] = []
  const provider: Provider = async (messages, _tools, toolChoice) => {
    asked.push({ roles: messages.map((message) => message.role), toolChoice })

    return completions[Math.min(asked.length, completions.length) - 1]
  }

  return { provider, asked }
}

async function run(
  completions: Completion[],
  limits = DEFAULT_LIMITS,
  question = "Quels travaux sur le mildiou ?",
) {
  const events: AssistantEvent[] = []
  const { provider, asked } = scripted(completions)
  const outcome = await converse(
    { history: [], question, language: "fr" },
    { provider, mcp, limits },
    (event) => events.push(event),
  )

  return { events, asked, outcome }
}

describe("mcpClient", () => {
  test("the tools of the server become tools of the model", async () => {
    const tools = await mcp.tools()

    expect(tools.map((tool) => tool.function.name)).toContain("search_rd_documents")
    expect(tools[0].type).toBe("function")
    expect(tools[0].function.parameters).toMatchObject({ type: "object" })
  })

  test("a failing or unknown tool is a result the model can read", async () => {
    expect(await mcp.call("get_enterprise", { siren: "1" })).toEqual({
      text: "This needs an API key",
      isError: true,
    })
    expect((await mcp.call("drop_database", {})).isError).toBe(true)
  })
})

describe("converse", () => {
  test("the model calls a tool, then answers with its sources", async () => {
    const { events, asked, outcome } = await run([
      toolCall("search_rd_documents", '{"query":"mildiou vigne"}'),
      answer("Un document : Lutte contre le mildiou : utilisation du cuivre (2022)."),
    ])

    expect(events.map((event) => event.type)).toEqual([
      "tool_call",
      "tool_result",
      "answer",
      "sources",
      "done",
    ])
    expect(events[0]).toMatchObject({ arguments: { query: "mildiou vigne" } })
    expect((events[3] as any).documents).toEqual([
      { ...DOCUMENT, href: "/rd-agri/documents/itab_243" },
    ])
    expect(asked[1].roles).toEqual(["system", "user", "assistant", "tool"])
    expect(outcome).toEqual({
      answered: true,
      rounds: 2,
      toolCalls: 1,
      usage: { input: 20, output: 10 },
    })
  })

  test("a model that keeps calling tools is made to answer", async () => {
    const { events, asked, outcome } = await run(
      [toolCall("search_rd_documents", '{"query":"x"}'), answer("Voilà.")],
      { ...DEFAULT_LIMITS, rounds: 2 },
    )

    expect(asked.map((call) => call.toolChoice)).toEqual(["auto", "none"])
    expect(outcome.toolCalls).toBe(1)
    expect(events.at(-1)).toEqual({ type: "done", rounds: 2, toolCalls: 1 })
  })

  test("no more tools are called than allowed", async () => {
    const many: Completion = {
      content: "",
      toolCalls: ["a", "b", "c"].map((id) => ({
        id,
        function: { name: "search_rd_documents", arguments: '{"query":"x"}' },
      })),
      usage: { input: 1, output: 1 },
    }
    const { events, outcome } = await run([many, answer("Fini.")], {
      ...DEFAULT_LIMITS,
      toolCalls: 2,
    })

    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(2)
    expect(outcome.toolCalls).toBe(2)
  })

  test("arguments that are not JSON are told to the model, not run", async () => {
    const { events, asked } = await run([
      toolCall("search_rd_documents", "not json"),
      answer("Désolé."),
    ])

    expect(events.map((event) => event.type)).toEqual(["answer", "sources", "done"])
    expect(asked[1].roles.at(-1)).toBe("tool")
  })

  test("an empty answer is an error, not a blank", async () => {
    const { events, outcome } = await run([answer("  ")])

    expect(events[0]).toMatchObject({ type: "error", code: "limit" })
    expect(outcome.answered).toBe(false)
  })

  test("the earlier turns are given back to the model", async () => {
    const { provider, asked } = scripted([answer("Oui.")])

    await converse(
      {
        history: [{ question: "Et le blé ?", answer: "Rien trouvé." }],
        question: "Et l'orge ?",
        language: "en",
      },
      { provider, mcp, limits: DEFAULT_LIMITS },
      () => undefined,
    )

    expect(asked[0].roles).toEqual(["system", "user", "assistant", "user"])
  })
})

describe("plainText", () => {
  test("the Markdown of an answer is removed, its lists are kept", () => {
    expect(
      plainText('## Résultats\n1. **"Titre"** (2023)\n   *Résumé en italique.*\n* point'),
    ).toBe('Résultats\n1. "Titre" (2023)\n   Résumé en italique.\n* point')
    expect(plainText("  5 * 3 = 15  ")).toBe("5 * 3 = 15")
  })
})

describe("historyOf", () => {
  test("only short, well formed turns are kept", () => {
    expect(historyOf("nope", DEFAULT_LIMITS)).toEqual([])
    expect(
      historyOf(
        [{ question: "a", answer: "b", role: "system" }, { question: 1 }],
        DEFAULT_LIMITS,
      ),
    ).toEqual([{ question: "a", answer: "b" }])
    expect(
      historyOf([{ question: "a", answer: "b".repeat(7000) }], DEFAULT_LIMITS),
    ).toEqual([])
    expect(
      historyOf(
        Array.from({ length: 6 }, (_, index) => ({ question: `q${index}`, answer: "a" })),
        DEFAULT_LIMITS,
      ).map((turn) => turn.question),
    ).toEqual(["q3", "q4", "q5"])
  })
})

describe("sources", () => {
  test("only the R&D tools name sources, and only from valid JSON", () => {
    expect(sourcesOf("read_resource", JSON.stringify(DOCUMENT))).toEqual([])
    expect(sourcesOf("search_rd_documents", '{"documents":[{"id":"x"')).toEqual([])
    expect(sourcesOf("get_rd_document", JSON.stringify(DOCUMENT))).toHaveLength(1)
  })

  test("the documents an answer names come first, without duplicates", () => {
    const other = {
      ...DOCUMENT,
      id: "b",
      title: "Couverts végétaux en grandes cultures",
      href: "/b",
    }
    const seen = [{ ...DOCUMENT, href: "/a" }, other, other]

    expect(citedSources("Voir « Couverts végétaux en grandes cultures ».", seen)).toEqual(
      [other],
    )
    expect(citedSources("Rien de précis.", seen)).toHaveLength(2)
  })
})

describe("provider", () => {
  const settings = {
    url: "https://example.test/v1",
    key: "k",
    model: "m",
    maxTokens: 10,
    timeoutMs: 1000,
  }
  const sending = (response: Response) =>
    (async () => response) as unknown as typeof fetch

  test("a completion is read whether it calls tools or answers", () => {
    expect(
      completionOf({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 1, function: { name: "t", arguments: { a: 1 } } }],
            },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    ).toEqual({
      content: "",
      toolCalls: [{ id: "1", function: { name: "t", arguments: '{"a":1}' } }],
      usage: { input: 3, output: 4 },
    })
    expect(() => completionOf({})).toThrow(ProviderDown)
  })

  test("each kind of failure has its own error", async () => {
    const busy = httpProvider(
      settings,
      sending(new Response("", { status: 429, headers: { "retry-after": "3" } })),
    )
    const down = httpProvider(settings, sending(new Response("", { status: 503 })))
    const refused = httpProvider(settings, sending(new Response("", { status: 401 })))

    expect(await busy([], [], "auto").catch((error) => error)).toMatchObject({
      retryAfterMs: 3000,
    })
    expect(await down([], [], "auto").catch((error) => error)).toBeInstanceOf(
      ProviderDown,
    )
    expect(await refused([], [], "auto").catch((error) => error)).toBeInstanceOf(
      ProviderRefusal,
    )
  })

  test("the key goes in the header and never in the body", async () => {
    const sent: { headers: any; body: string }[] = []
    const provider = httpProvider({ ...settings, key: "secret-key" }, (async (
      _url: string,
      init: any,
    ) => {
      sent.push({ headers: init.headers, body: init.body })

      return Response.json({ choices: [{ message: { content: "ok" } }] })
    }) as unknown as typeof fetch)

    await provider([{ role: "user", content: "q" }], [], "auto")

    expect(sent[0].headers.Authorization).toBe("Bearer secret-key")
    expect(sent[0].body).not.toContain("secret-key")
    expect(sent[0].body).not.toContain("tool_choice")
  })
})

describe("enqueue", () => {
  const settings = (overrides = {}) => {
    const clock = { now: 0, slept: [] as number[] }

    return {
      clock,
      settings: {
        minIntervalMs: 400,
        maxWaiting: 2,
        retries: 2,
        now: () => clock.now,
        sleep: async (ms: number) => {
          clock.slept.push(ms)
          clock.now += ms
        },
        ...overrides,
      },
    }
  }

  test("calls run one after the other, spaced out", async () => {
    const { clock, settings: queueSettings } = settings()
    const queue = emptyQueue()
    const order: string[] = []
    const waits: number[] = []

    clock.now = 1000
    await Promise.all([
      enqueue(queue, queueSettings, async () => order.push("a")),
      enqueue(
        queue,
        queueSettings,
        async () => order.push("b"),
        (ahead) => waits.push(ahead),
      ),
    ])

    expect(order).toEqual(["a", "b"])
    expect(waits).toEqual([1])
    expect(clock.slept).toEqual([400])
    expect(queue.waiting).toBe(0)
  })

  test("a busy provider is asked again, then the error is given", async () => {
    const { clock, settings: queueSettings } = settings()
    const calls = { count: 0 }
    const flaky = async () => {
      calls.count += 1
      if (calls.count < 3) throw new ProviderBusy(1000)

      return "ok"
    }

    clock.now = 5000
    expect(await enqueue(emptyQueue(), queueSettings, flaky)).toBe("ok")
    expect(clock.slept.filter((ms) => ms === 1000)).toHaveLength(2)

    const always = async () => {
      throw new ProviderBusy(10)
    }
    expect(
      await enqueue(emptyQueue(), queueSettings, always).catch((error) => error),
    ).toBeInstanceOf(ProviderBusy)
  })

  test("a full queue refuses at once, and a failure frees its place", async () => {
    const { settings: queueSettings } = settings({ maxWaiting: 1 })
    const queue = emptyQueue()
    const first = enqueue(queue, queueSettings, async () => {
      throw new ProviderDown("x")
    })

    expect(
      await enqueue(queue, queueSettings, async () => 1).catch((error) => error),
    ).toBeInstanceOf(QueueFull)
    expect(await first.catch((error) => error)).toBeInstanceOf(ProviderDown)
    expect(await enqueue(queue, queueSettings, async () => 2)).toBe(2)
  })
})

describe("allowance", () => {
  const limits = { anonymous: 2, key: 3, total: 4 }
  const day = Date.UTC(2026, 9, 4, 10)
  const visitor = { id: "ip:1.2.3.4", hasKey: false }
  const member = { id: "abcd1234", hasKey: true }

  test("a caller has its own count, a key holder a larger one", () => {
    const state = emptyAllowance()

    expect(remaining(state, limits, visitor, day)).toBe(2)
    expect(takeQuestion(state, limits, visitor, day)).toBeUndefined()
    expect(takeQuestion(state, limits, visitor, day)).toBeUndefined()
    expect(takeQuestion(state, limits, visitor, day)).toEqual({
      reason: "caller",
      limit: 2,
    })
    expect(remaining(state, limits, member, day)).toBe(2)
  })

  test("the total of the day stops everyone, and comes back after a restart", () => {
    const state = emptyAllowance()

    restoreTotal(state, 4, day)
    expect(takeQuestion(state, limits, member, day)).toEqual({
      reason: "total",
      limit: 4,
    })
    expect(remaining(state, limits, member, day)).toBe(0)
  })

  test("the next day starts from zero, and a question can be given back", () => {
    const state = emptyAllowance()

    takeQuestion(state, limits, visitor, day)
    giveBackQuestion(state, visitor.id, day)
    expect(remaining(state, limits, visitor, day)).toBe(2)

    takeQuestion(state, limits, visitor, day)
    takeQuestion(state, limits, visitor, day)
    expect(remaining(state, limits, visitor, day + 24 * 3600 * 1000)).toBe(2)
  })
})

describe("settings", () => {
  const defaults = { enabled: true, model: "ministral-8b-latest" }

  test("what an administrator stored wins over the environment", () => {
    expect(settingsOf([], defaults)).toEqual(defaults)
    expect(
      settingsOf(
        [
          { key: "assistant.enabled", value: "false" },
          { key: "assistant.model", value: "open-mistral-nemo" },
        ],
        defaults,
      ),
    ).toEqual({ enabled: false, model: "open-mistral-nemo" })
  })

  test("a model name that is not one is ignored", () => {
    expect(
      settingsOf([{ key: "assistant.model", value: "x y; rm" }], defaults).model,
    ).toBe(defaults.model)
    expect(isModelName("mistral-small-2506")).toBe(true)
    expect(isModelName("")).toBe(false)
  })
})
