import { Html } from "@elysiajs/html"
import { API } from "../API"
import { Hypermedia } from "../Hypermedia"
import {
  filtersOf,
  PAGE_SIZE,
  readDocument,
  searchDocuments,
  type DocumentFilters,
  type DocumentRecord,
  type DocumentSummary,
} from "../rd-agri/RdAgri"
import { Layout } from "../templates/layouts/Layout"
import type { Context } from "../types/Context"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const SOURCE_URL = "https://rd-agri.fr"
const LICENCE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr"

const refusal = (status: number, message: string) =>
  Response.json({ error: { status, message } }, { status })

const breadcrumbs = (cxt: Context, withDocuments: boolean) => [
  Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: cxt.t("rd_agri_title"), method: "GET", href: "/rd-agri" }),
  ...(withDocuments
    ? [
        Hypermedia.Link({
          value: cxt.t("rd_agri_documents_title"),
          method: "GET",
          href: "/rd-agri/documents",
        }),
      ]
    : []),
]

// The documents keep the licence of their source: it is recalled wherever they are shown
function Attribution(props: { cxt: Context }) {
  return (
    <p>
      <small>
        {props.cxt.t("rd_agri_source")}{" "}
        <a href={SOURCE_URL}>Plateforme R&amp;D Agricole</a> (ACTA) —{" "}
        <a href={LICENCE_URL}>CC BY-NC-SA 4.0</a>. {props.cxt.t("rd_agri_non_commercial")}
      </small>
    </p>
  )
}

const FILTER_FIELDS = [
  ["q", "rd_agri_filter_words"],
  ["pest", "rd_agri_filter_pest"],
  ["publisher", "rd_agri_filter_publisher"],
  ["year-from", "rd_agri_filter_year_from"],
  ["year-to", "rd_agri_filter_year_to"],
] as const

const searchOf = (filters: DocumentFilters, page: number) =>
  new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, String(value)]),
    ),
    ...(page > 1 ? { page: String(page) } : {}),
  }).toString()

const CSV_COLUMNS = ["id", "title", "year", "publisher", "url"] as const

function csvOf(documents: DocumentSummary[]) {
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`

  return [
    CSV_COLUMNS.join(","),
    ...documents.map((document) =>
      CSV_COLUMNS.map((column) => cell(document[column])).join(","),
    ),
  ].join("\n")
}

function index(cxt: Context) {
  return (
    <Layout
      title={cxt.t("rd_agri_title")}
      breadcrumbs={breadcrumbs(cxt, false).slice(0, 1)}
      t={cxt.t}
    >
      <p>{cxt.t("rd_agri_introduction")}</p>
      <ul>
        <li>
          <a href="/rd-agri/documents">{cxt.t("rd_agri_documents_title")}</a>
        </li>
        <li>
          <a href="/tools/assistant">{cxt.t("tools_assistant")}</a> —{" "}
          {cxt.t("rd_agri_ask_assistant")}
        </li>
      </ul>
      <Attribution cxt={cxt} />
    </Layout>
  )
}

function ListPage(props: {
  cxt: Context
  filters: DocumentFilters
  page: number
  total: number
  relaxed: boolean
  documents: DocumentSummary[]
}) {
  const { cxt, filters, page, total } = props
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const search = searchOf(filters, 1)

  return (
    <Layout
      title={cxt.t("rd_agri_documents_title")}
      breadcrumbs={breadcrumbs(cxt, false)}
      t={cxt.t}
    >
      <form method="get" action="/rd-agri/documents">
        {FILTER_FIELDS.map(([name, label]) => (
          <label style={{ display: "inline-block", marginRight: "10px" }}>
            {cxt.t(label)}
            <br />
            <input
              class="field"
              name={name}
              value={e(filters[name] ?? "")}
              style={{ width: name === "q" ? "280px" : "130px" }}
            />
          </label>
        ))}
        <button class="button primary" type="submit">
          {cxt.t("rd_agri_search")}
        </button>
      </form>

      <p>
        {cxt.numberFormatter(total)} {cxt.t("rd_agri_documents_count")}
        {props.relaxed ? ` — ${cxt.t("rd_agri_relaxed")}` : ""}.{" "}
        <a href={`/rd-agri/documents.json?${e(search)}`}>JSON</a>,{" "}
        <a href={`/rd-agri/documents.csv?${e(search)}`}>CSV</a>
      </p>

      {props.documents.map((document) => (
        <div style={{ marginBottom: "14px" }}>
          <a href={e(document.links.self)}>
            <b>{e(document.title)}</b>
          </a>
          <br />
          <small>
            {e([document.year, document.publisher].filter(Boolean).join(" · "))}
          </small>
          {document.excerpt ? <div>{e(document.excerpt)}</div> : ""}
        </div>
      ))}

      <p>
        {page > 1 ? (
          <a href={`/rd-agri/documents?${e(searchOf(filters, page - 1))}`}>←</a>
        ) : (
          ""
        )}{" "}
        {page} / {lastPage}{" "}
        {page < lastPage ? (
          <a href={`/rd-agri/documents?${e(searchOf(filters, page + 1))}`}>→</a>
        ) : (
          ""
        )}
      </p>
      <Attribution cxt={cxt} />
    </Layout>
  )
}

async function list(cxt: Context) {
  const filters = filtersOf(cxt.query)
  const asked = Number(cxt.query.page)
  const page = Number.isInteger(asked) && asked > 0 ? asked : 1
  const result = await searchDocuments(cxt.db, filters, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  if (result === undefined) {
    return refusal(404, "The R&D documents are not in service")
  }
  if (cxt.output === "json") {
    return Response.json({
      "@id": new URL(cxt.request.url).pathname,
      title: cxt.t("rd_agri_documents_title"),
      licence: "CC BY-NC-SA 4.0",
      source: SOURCE_URL,
      page,
      "items-count": result.total,
      relaxed: result.relaxed,
      documents: result.documents,
    })
  }
  if (cxt.output === "csv") {
    return new Response(csvOf(result.documents) + "\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    })
  }

  return ListPage({ cxt, filters, page, ...result })
}

function LinkedList(props: { title: string; values: string[] }) {
  return props.values.length === 0 ? (
    ""
  ) : (
    <li>
      <b>{e(props.title)} :</b> {e(props.values.join(", "))}
    </li>
  )
}

function DetailPage(props: { cxt: Context; document: DocumentRecord }) {
  const { cxt, document } = props

  return (
    <Layout title={document.title} breadcrumbs={breadcrumbs(cxt, true)} t={cxt.t}>
      <p>
        <small>
          {e(
            [document.year, document.publisher, document.language]
              .filter(Boolean)
              .join(" · "),
          )}
        </small>
      </p>
      {document.description ? <p>{e(document.description)}</p> : ""}
      <ul>
        <li>
          <a href={e(document.url)}>{cxt.t("rd_agri_see_source")}</a>
          {document["document-url"] ? (
            <span>
              {" "}
              · <a href={e(document["document-url"])}>{cxt.t("rd_agri_see_document")}</a>
            </span>
          ) : (
            ""
          )}
        </li>
        {document.project ? (
          <li>
            <b>{cxt.t("rd_agri_project")} :</b>{" "}
            {e(document.project.name ?? document.project.code)}
          </li>
        ) : (
          ""
        )}
        <LinkedList title={cxt.t("rd_agri_keywords")} values={document.keywords} />
        <LinkedList title={cxt.t("rd_agri_productions")} values={document.productions} />
        <LinkedList title={cxt.t("rd_agri_taxa")} values={document.taxa} />
        <LinkedList
          title={cxt.t("rd_agri_production_systems")}
          values={document["production-systems"]}
        />
        <LinkedList
          title={cxt.t("rd_agri_areas")}
          values={document.areas.map((area) => `${area.kind} ${area.code}`)}
        />
        <LinkedList
          title={cxt.t("rd_agri_pests")}
          values={document.pests.map((pest) => pest.label)}
        />
      </ul>
      <p>
        <a href={`${e(document.links.self)}.json`}>JSON</a>
      </p>
      <Attribution cxt={cxt} />
    </Layout>
  )
}

async function detail(cxt: Context) {
  // The format is part of the last segment: /rd-agri/documents/itab_243.json
  const wantsJson = cxt.params.id.endsWith(".json")
  const id = decodeURIComponent(cxt.params.id.replace(/\.json$/, ""))
  const document = await readDocument(cxt.db, id)

  if (document === undefined) {
    return refusal(404, "The R&D documents are not in service")
  }
  if (document === null) {
    return refusal(404, `No document ${id}`)
  }

  return wantsJson ? Response.json(document) : DetailPage({ cxt, document })
}

export const RdAgri = API.new()
  .path("/rd-agri", index)
  .path("/rd-agri/documents", list)
  .path("/rd-agri/documents/:id", detail)
