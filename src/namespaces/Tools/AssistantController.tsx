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

// What each tool of the MCP server does, said for someone who does not know the protocol.
// The name of the tool stays in the details of the step.
const STEPS: Record<string, { fr: string; en: string }> = {
  list_datasets: { fr: "Liste des jeux de données", en: "List of the datasets" },
  describe_dataset: { fr: "Description du jeu", en: "Description of the dataset" },
  list_resources: { fr: "Liste des ressources", en: "List of the resources" },
  read_resource: { fr: "Lecture de", en: "Reading" },
  get_commune: { fr: "Fiche de la commune", en: "Record of the commune" },
  get_enterprise: { fr: "Fiche de l'entreprise", en: "Record of the company" },
  search_rd_documents: {
    fr: "Recherche dans les documents de R&D",
    en: "Search in the R&D documents",
  },
  get_rd_document: { fr: "Lecture du document", en: "Reading the document" },
  get_crop_history: { fr: "Cultures déclarées au point", en: "Crops declared at the point" },
  get_input_price: { fr: "Prix de l'intrant", en: "Price of the input" },
}

// What the page does once loaded: it sends the question, then shows each event as it comes.
// Everything the model or a dataset wrote is put in the page as text, never as markup.
const SCRIPT = `
(function () {
  var form = document.getElementById("duke-form")
  var input = document.getElementById("duke-question")
  var button = document.getElementById("duke-ask")
  var log = document.getElementById("duke-log")
  var left = document.getElementById("duke-remaining")
  var reset = document.getElementById("duke-reset")
  var labels = JSON.parse(document.getElementById("duke-labels").textContent)
  var steps = JSON.parse(document.getElementById("duke-steps").textContent)
  var turns = []
  var busy = false

  function el(tag, text, className) {
    var node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
  }

  // The few marks a model puts in its answers: bold, italics, code, links
  function inline(parent, text) {
    var pattern = /\\*\\*([^*]+)\\*\\*|\\*([^*\\n]+)\\*|\`([^\`]+)\`|\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g
    var last = 0
    var match
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)))
      if (match[1] !== undefined) parent.appendChild(el("strong", match[1]))
      else if (match[2] !== undefined) parent.appendChild(el("em", match[2]))
      else if (match[3] !== undefined) parent.appendChild(el("code", match[3]))
      else if (/^(https?:\\/\\/|\\/)/.test(match[5])) {
        var link = el("a", match[4])
        link.href = match[5]
        if (match[5].charAt(0) !== "/") { link.target = "_blank"; link.rel = "noopener" }
        parent.appendChild(link)
      } else parent.appendChild(document.createTextNode(match[4]))
      last = pattern.lastIndex
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)))
  }

  // Paragraphs, lists and titles of an answer, read line by line
  function render(target, text) {
    target.textContent = ""
    var list = null
    var paragraph = []
    function flush() {
      if (paragraph.length === 0) return
      inline(target.appendChild(el("p")), paragraph.join(" "))
      paragraph = []
    }
    text.split("\\n").forEach(function (raw) {
      var line = raw.trim()
      var bullet = /^[-*•]\\s+(.*)$/.exec(line)
      var numbered = /^\\d+[.)]\\s+(.*)$/.exec(line)
      var title = /^#{1,6}\\s+(.*)$/.exec(line)
      var item = bullet || numbered
      if (item) {
        flush()
        var kind = bullet ? "UL" : "OL"
        if (!list || list.tagName !== kind) list = target.appendChild(el(kind.toLowerCase()))
        inline(list.appendChild(el("li")), item[1])
        return
      }
      list = null
      if (line === "") flush()
      else if (title) { flush(); inline(target.appendChild(el("h3")), title[1]) }
      else paragraph.push(line)
    })
    flush()
  }

  // « Recherche dans les documents de R&D : mildiou vigne bio »
  function stepLabel(name, args) {
    var said = steps[name] || name
    var about = args && (args.query || args.path || args.name || args.insee_code || args.siren || args.id || args.article)
    if (!about && args && args.latitude !== undefined) about = args.latitude + ", " + args.longitude
    return about ? said + " : " + about : said
  }

  function grow() {
    input.style.height = "auto"
    input.style.height = Math.min(input.scrollHeight, 256) + "px"
  }
  input.addEventListener("input", grow)
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  Array.prototype.forEach.call(document.querySelectorAll("[data-example]"), function (example) {
    example.addEventListener("click", function () {
      if (busy) return
      input.value = example.textContent
      grow()
      form.requestSubmit()
    })
  })

  reset.addEventListener("click", function () {
    if (busy) return
    turns = []
    log.textContent = ""
    reset.hidden = true
    input.focus()
  })

  form.addEventListener("submit", function (submission) {
    submission.preventDefault()
    var question = input.value.trim()
    if (question === "" || busy) return

    busy = true
    button.disabled = true
    var turn = el("article", undefined, "duke-turn")
    var thread = el("ol", undefined, "duke-thread")
    var status = el("p", labels.thinking, "duke-status")
    var answer = el("div", undefined, "duke-answer")
    var sources = el("div", undefined, "duke-sources")
    var lastStep
    var answered = false
    thread.hidden = true
    status.setAttribute("role", "status")
    turn.appendChild(el("h2", question))
    turn.appendChild(thread)
    turn.appendChild(status)
    turn.appendChild(answer)
    turn.appendChild(sources)
    log.insertBefore(turn, log.firstChild)
    input.value = ""
    grow()

    function problem(code) {
      status.hidden = true
      answer.textContent = ""
      answer.appendChild(el("p", labels["error_" + code] || labels.error_down, "duke-problem"))
      // The question comes back in the field: it is not to be typed again
      if (input.value === "") { input.value = question; grow() }
    }

    function show(event) {
      if (event.type === "waiting") {
        status.textContent = labels.waiting.replace("%d", event.ahead)
      } else if (event.type === "tool_call") {
        thread.hidden = false
        lastStep = el("li")
        var details = el("details")
        var summary = el("summary", stepLabel(event.name, event.arguments))
        details.appendChild(summary)
        details.appendChild(
          el(
            "pre",
            JSON.stringify(
              { jsonrpc: "2.0", method: "tools/call", params: { name: event.name, arguments: event.arguments } },
              null,
              2
            )
          )
        )
        lastStep.appendChild(details)
        thread.appendChild(lastStep)
        status.textContent = labels.thinking
      } else if (event.type === "tool_result" && lastStep) {
        if (event.isError) lastStep.className = "failed"
        lastStep.querySelector("summary").appendChild(
          el("span", " — " + (event.isError ? labels.failed : labels.result.replace("%d", event.size)), "outcome")
        )
        lastStep.querySelector("details").appendChild(
          el("pre", event.excerpt + (event.size > event.excerpt.length ? "…" : ""))
        )
      } else if (event.type === "answer") {
        answered = true
        status.hidden = true
        render(answer, event.text)
        turns.push({ question: question, answer: event.text })
        turns = turns.slice(-3)
      } else if (event.type === "sources" && event.documents.length > 0) {
        sources.appendChild(el("h3", labels.sources))
        var list = el("ul")
        event.documents.forEach(function (source) {
          var item = el("li")
          var link = el("a", source.title + (source.year ? " (" + source.year + ")" : ""))
          if (/^https?:\\/\\//.test(source.url)) link.href = source.url
          link.target = "_blank"
          link.rel = "noopener"
          item.appendChild(link)
          var record = el("a", labels.lexicon_record, "record-link")
          record.href = source.href
          item.appendChild(record)
          list.appendChild(item)
        })
        sources.appendChild(list)
      } else if (event.type === "error") {
        problem(event.code)
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
              problem((body.error && body.error.code) || "down")
            },
            function () {
              problem("down")
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
        problem("down")
      })
      .then(function () {
        if (!answered && !status.hidden) problem("down")
        busy = false
        button.disabled = false
        reset.hidden = turns.length === 0
        input.focus()
      })
  })
})()
`

export function AssistantPage(cxt: Context, breadcrumbs: HypermediaType["Link"][]) {
  const t = (key: string) => cxt.t("tools_assistant_" + key)
  const language = languageOf(cxt)
  const labels = Object.fromEntries(LABELS.map((label) => [label, t(label)]))
  const steps = Object.fromEntries(
    Object.entries(STEPS).map(([name, said]) => [name, said[language]]),
  )
  const isAvailable = PROVIDER.key !== undefined
  const count = remaining(allowance, ALLOWANCE_LIMITS, callerOf(cxt), Date.now())
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

  return (
    <Layout title={cxt.t("tools_assistant")} breadcrumbs={breadcrumbs} t={cxt.t}>
      <div class="duke">
        <p class="prose">{t("introduction")}</p>

        {isAvailable ? (
          <>
            <form class="duke-composer" id="duke-form">
              <label class="visually-hidden" for="duke-question">
                {t("question")}
              </label>
              <textarea
                id="duke-question"
                name="question"
                rows="2"
                maxlength={String(DEFAULT_LIMITS.questionLength)}
                placeholder={Html.escapeHtml(t("placeholder"))}
                required
              ></textarea>
              <div class="duke-composer-foot">
                <span id="duke-remaining">
                  {Html.escapeHtml(t("remaining").replace("%d", String(count)))}
                </span>
                <button class="button primary" id="duke-ask" type="submit">
                  {t("ask")}
                </button>
              </div>
            </form>
            <div class="duke-examples">
              <span>{t("examples")}</span>
              {EXAMPLES.map((example) => (
                <button type="button" data-example="1">
                  {Html.escapeHtml(t(example))}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p class="duke-problem">{t("error_disabled")}</p>
        )}

        <div id="duke-log"></div>
        <p class="duke-reset">
          <button class="button small" type="button" id="duke-reset" hidden>
            {t("reset")}
          </button>
        </p>

        <div class="duke-about">
          <p>{t("notice")}</p>
          <p>
            {t("how")} <a href="/rd-agri">{cxt.t("rd_agri_title")}</a>, {t("from")}{" "}
            <a href="https://rd-agri.fr">Plateforme R&amp;D Agricole</a>, CC BY-NC-SA 4.0.
          </p>
        </div>
      </div>

      <script type="application/json" id="duke-labels">
        {json(labels)}
      </script>
      <script type="application/json" id="duke-steps">
        {json(steps)}
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
