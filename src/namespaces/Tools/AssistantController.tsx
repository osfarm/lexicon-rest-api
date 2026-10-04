import { Html } from "@elysiajs/html"
import { anonymousIdentity } from "../../access/AccessControl"
import {
  dayOf,
  giveBackQuestion,
  remaining,
  takeQuestion,
} from "../../assistant/Allowance"
import { recordQuestion } from "../../assistant/AssistantStore"
import {
  converse,
  DEFAULT_LIMITS,
  historyOf,
  type AssistantEvent,
} from "../../assistant/Conversation"
import { mcpClient } from "../../assistant/McpClient"
import type { AssistantLanguage } from "../../assistant/Prompt"
import {
  httpProvider,
  ProviderBusy,
  ProviderRefusal,
  type Provider,
} from "../../assistant/Provider"
import { enqueue, QueueFull } from "../../assistant/ProviderQueue"
import {
  allowance,
  ALLOWANCE_LIMITS,
  currentSettings,
  PROVIDER,
  queue,
  QUEUE_SETTINGS,
  restoreAllowance,
} from "../../assistant/Runtime"
import type { HypermediaType } from "../../Hypermedia"
import { handleMcpMessage } from "../../mcp/Mcp"
import { Layout } from "../../templates/layouts/Layout"
import type { Context } from "../../types/Context"
import { backendFor } from "../Mcp"

const MAX_BODY_LENGTH = 16000
const KEEP_ALIVE_IN_MS = 10000

const LABELS = [
  "thinking",
  "waiting",
  "tool",
  "result",
  "failed",
  "sources",
  "lexicon_record",
  "remaining",
  "error_quota",
  "error_busy",
  "error_down",
  "error_limit",
  "error_disabled",
  "error_allowance",
] as const

const EXAMPLES = ["example_1", "example_2", "example_3"] as const

const languageOf = (cxt: Context): AssistantLanguage =>
  cxt.language === "en" ? "en" : "fr"

const callerOf = (cxt: Context) => ({
  id: cxt.identity.caller,
  hasKey: cxt.identity.kind === "key",
})

const refusal = (status: number, code: string, message: string) =>
  Response.json({ error: { status, code, message } }, { status })

// The assistant reads the Lexicon as an anonymous caller would, whoever asks:
// nothing reserved to members is ever sent to the provider of the model
function anonymous(cxt: Context): Context {
  return {
    ...cxt,
    identity: anonymousIdentity(cxt.identity.caller.replace(/^ip:/, "")),
    request: new Request(cxt.request.url),
  }
}

// What the page does once loaded: it sends the question, then shows each event as it comes
const SCRIPT = `
(function () {
  var form = document.getElementById("duke-form")
  var input = document.getElementById("duke-question")
  var button = document.getElementById("duke-ask")
  var log = document.getElementById("duke-log")
  var left = document.getElementById("duke-remaining")
  var labels = JSON.parse(document.getElementById("duke-labels").textContent)
  var turns = []

  function el(tag, text, style) {
    var node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (style) node.setAttribute("style", style)
    return node
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-example]"), function (example) {
    example.addEventListener("click", function () {
      input.value = example.textContent
      form.requestSubmit()
    })
  })

  form.addEventListener("submit", function (submission) {
    submission.preventDefault()
    var question = input.value.trim()
    if (question === "" || button.disabled) return

    button.disabled = true
    var turn = el("div", undefined, "margin: 18px 0; padding-top: 12px; border-top: 1px solid #ddd")
    var steps = el("div")
    var status = el("p", labels.thinking, "white-space: pre-wrap")
    var sources = el("div")
    var lastStep
    turn.appendChild(el("p", question, "font-weight: bold"))
    turn.appendChild(steps)
    turn.appendChild(status)
    turn.appendChild(sources)
    log.insertBefore(turn, log.firstChild)

    function show(event) {
      if (event.type === "waiting") {
        status.textContent = labels.waiting.replace("%d", event.ahead)
      } else if (event.type === "tool_call") {
        lastStep = el("details", undefined, "margin: 4px 0; font-size: 0.9em")
        lastStep.appendChild(el("summary", labels.tool + " " + event.name + " " + JSON.stringify(event.arguments)))
        lastStep.appendChild(
          el(
            "pre",
            JSON.stringify(
              { jsonrpc: "2.0", method: "tools/call", params: { name: event.name, arguments: event.arguments } },
              null,
              2
            ),
            "white-space: pre-wrap; overflow-wrap: anywhere"
          )
        )
        steps.appendChild(lastStep)
        status.textContent = labels.thinking
      } else if (event.type === "tool_result" && lastStep) {
        lastStep.firstChild.textContent +=
          " — " + (event.isError ? labels.failed : labels.result.replace("%d", event.size))
        lastStep.appendChild(el("pre", event.excerpt + (event.size > event.excerpt.length ? "…" : ""), "white-space: pre-wrap; overflow-wrap: anywhere"))
      } else if (event.type === "answer") {
        status.textContent = event.text
        turns.push({ question: question, answer: event.text })
        turns = turns.slice(-3)
      } else if (event.type === "sources" && event.documents.length > 0) {
        sources.appendChild(el("b", labels.sources))
        var list = el("ul")
        event.documents.forEach(function (source) {
          var item = el("li")
          var link = el("a", source.title + (source.year ? " (" + source.year + ")" : ""))
          if (/^https?:\\/\\//.test(source.url)) link.href = source.url
          link.target = "_blank"
          link.rel = "noopener"
          item.appendChild(link)
          item.appendChild(document.createTextNode(" · "))
          var record = el("a", labels.lexicon_record)
          record.href = source.href
          item.appendChild(record)
          list.appendChild(item)
        })
        sources.appendChild(list)
      } else if (event.type === "error") {
        status.textContent = labels["error_" + event.code] || labels.error_down
      } else if (event.type === "remaining") {
        left.textContent = labels.remaining.replace("%d", event.count)
      }
    }

    fetch("/tools/assistant/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question, history: turns }),
    })
      .then(function (response) {
        if (!response.ok || !response.body) {
          return response.json().then(
            function (body) {
              show({ type: "error", code: (body.error && body.error.code) || "down" })
            },
            function () {
              show({ type: "error", code: "down" })
            }
          )
        }
        var reader = response.body.getReader()
        var decoder = new TextDecoder()
        var buffer = ""
        function read() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return
            buffer += decoder.decode(chunk.value, { stream: true })
            var end
            while ((end = buffer.indexOf("\\n\\n")) >= 0) {
              var line = buffer.slice(0, end)
              buffer = buffer.slice(end + 2)
              if (line.indexOf("data: ") === 0) show(JSON.parse(line.slice(6)))
            }
            return read()
          })
        }
        return read()
      })
      .catch(function () {
        show({ type: "error", code: "down" })
      })
      .then(function () {
        if (status.textContent === labels.thinking) status.textContent = labels.error_down
        button.disabled = false
        input.value = ""
      })
  })
})()
`

export function AssistantPage(cxt: Context, breadcrumbs: HypermediaType["Link"][]) {
  const t = (key: string) => cxt.t("tools_assistant_" + key)
  const labels = Object.fromEntries(LABELS.map((label) => [label, t(label)]))
  const isAvailable = PROVIDER.key !== undefined
  const count = remaining(allowance, ALLOWANCE_LIMITS, callerOf(cxt), Date.now())

  return (
    <Layout title={cxt.t("tools_assistant")} breadcrumbs={breadcrumbs} t={cxt.t}>
      <p>{t("introduction")}</p>
      <p>
        <small>ⓘ {t("notice")}</small>
      </p>

      {isAvailable ? (
        <form id="duke-form">
          <input
            class="field"
            id="duke-question"
            name="question"
            maxlength={String(DEFAULT_LIMITS.questionLength)}
            placeholder={Html.escapeHtml(t("placeholder"))}
            autocomplete="off"
            required
          />
          <p>
            {t("examples")}{" "}
            {EXAMPLES.map((example) => (
              <button
                type="button"
                class="button"
                data-example="1"
                style={{ margin: "3px" }}
              >
                {Html.escapeHtml(t(example))}
              </button>
            ))}
          </p>
          <button class="button primary" id="duke-ask" type="submit">
            {t("ask")}
          </button>{" "}
          <small id="duke-remaining">
            {Html.escapeHtml(t("remaining").replace("%d", String(count)))}
          </small>
        </form>
      ) : (
        <p>
          <b>{t("error_disabled")}</b>
        </p>
      )}

      <div id="duke-log"></div>

      <p>
        <small>
          {t("how")} <a href="/rd-agri">{cxt.t("rd_agri_title")}</a> —{" "}
          <a href="https://rd-agri.fr">Plateforme R&amp;D Agricole</a>, CC BY-NC-SA 4.0.
        </small>
      </p>

      <script type="application/json" id="duke-labels">
        {JSON.stringify(labels).replace(/</g, "\\u003c")}
      </script>
      {isAvailable ? <script>{SCRIPT}</script> : ""}
    </Layout>
  )
}

export async function askAssistant(cxt: Context): Promise<Response> {
  if (cxt.request.method !== "POST") {
    return new Response("Questions are sent by POST", {
      status: 405,
      headers: { Allow: "POST" },
    })
  }

  // Another site must not be able to spend the allowance of its own visitors here
  const origin = cxt.request.headers.get("origin")
  if (origin !== null && URL.parse(origin)?.host !== cxt.request.headers.get("host")) {
    return refusal(403, "down", "Questions are only taken from the page of the assistant")
  }

  const body = await cxt.request.text()
  if (body.length > MAX_BODY_LENGTH) {
    return refusal(413, "down", "The request is too long")
  }

  const sent = await Promise.resolve(body)
    .then(JSON.parse)
    .catch(() => undefined)
  const question = typeof sent?.question === "string" ? sent.question.trim() : ""
  if (question === "" || question.length > DEFAULT_LIMITS.questionLength) {
    return refusal(
      400,
      "down",
      `A question has 1 to ${DEFAULT_LIMITS.questionLength} characters`,
    )
  }

  const now = Date.now()
  const settings = await currentSettings(cxt.db, now)
  const key = PROVIDER.key
  if (key === undefined || !settings.enabled) {
    return refusal(503, "disabled", "The assistant is not available")
  }

  await restoreAllowance(cxt.db, now)
  const caller = callerOf(cxt)
  const refused = takeQuestion(allowance, ALLOWANCE_LIMITS, caller, now)
  if (refused !== undefined) {
    return refusal(
      429,
      refused.reason === "caller" ? "allowance" : "quota",
      refused.reason === "caller"
        ? `No more than ${refused.limit} questions a day`
        : "The assistant has answered all it can today",
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const state = { open: true }
      const write = (text: string) => {
        if (state.open) {
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            // The visitor left: the question goes on, unheard
            state.open = false
          }
        }
      }
      const emit = (event: AssistantEvent | { type: "remaining"; count: number }) =>
        write(`data: ${JSON.stringify(event)}\n\n`)
      // Idle connections are cut after 30 seconds: something is sent before that
      const keepAlive = setInterval(() => write(": waiting\n\n"), KEEP_ALIVE_IN_MS)

      const ask = httpProvider({ ...PROVIDER, key, model: settings.model })
      const provider: Provider = (messages, tools, toolChoice) =>
        enqueue(
          queue,
          QUEUE_SETTINGS,
          () => ask(messages, tools, toolChoice),
          (ahead) => emit({ type: "waiting", ahead }),
        )
      const reader = anonymous(cxt)
      const mcp = mcpClient((message) => handleMcpMessage(message, backendFor(reader)))
      const count = { toolCalls: 0, input: 0, output: 0, failed: false, counted: true }

      try {
        const outcome = await converse(
          {
            history: historyOf(sent.history, DEFAULT_LIMITS),
            question,
            language: languageOf(cxt),
          },
          { provider, mcp, limits: DEFAULT_LIMITS },
          emit,
        )

        count.toolCalls = outcome.toolCalls
        count.input = outcome.usage.input
        count.output = outcome.usage.output
        count.failed = !outcome.answered
      } catch (error) {
        // The caller is not at fault: the question is given back
        giveBackQuestion(allowance, caller.id, Date.now())
        count.failed = true
        count.counted = false

        const code =
          error instanceof QueueFull
            ? "busy"
            : error instanceof ProviderBusy
              ? "quota"
              : "down"
        if (error instanceof ProviderRefusal || code === "down") {
          console.warn("Assistant: " + (error as Error).message)
        }
        emit({ type: "error", code, message: "The assistant could not answer" })
      } finally {
        clearInterval(keepAlive)
        await recordQuestion(cxt.db, dayOf(now), {
          counted: count.counted,
          toolCalls: count.toolCalls,
          failed: count.failed,
          inputTokens: count.input,
          outputTokens: count.output,
        })
        emit({
          type: "remaining",
          count: remaining(allowance, ALLOWANCE_LIMITS, caller, Date.now()),
        })
        if (state.open) {
          try {
            controller.close()
          } catch {
            state.open = false
          }
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
