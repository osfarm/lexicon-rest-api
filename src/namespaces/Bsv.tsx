import { Html } from "@elysiajs/html"
import { API } from "../API"
import { Hypermedia } from "../Hypermedia"
import {
  archiveDocumentOf,
  bulletinOf,
  departmentOf,
  isDepartment,
  LEVELS,
  RECENT_DAYS,
  riskQueryOf,
  risksOf,
  SEARCH_PAGE_SIZE,
  searchBulletins,
  searchQueryOf,
  type ArchiveDocument,
  type BulletinRecord,
  type BulletinReference,
  type BulletinSearch,
  type CropStage,
  type RiskLine,
  type Risks,
  type SearchQuery,
} from "../bsv/Bsv"
import { placeOf, type Place } from "../territory/Trainings"
import { Layout } from "../templates/layouts/Layout"
import type { Context } from "../types/Context"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const ARCHIVE_URL =
  "https://www.data.gouv.fr/fr/datasets/archive-en-agro-ecologie-de-bsv-bulletins-de-sante-du-vegetal/"
const ARCHIVE_LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/deed.fr"

const refusal = (status: number, message: string) =>
  Response.json({ error: { status, message } }, { status })

const NOT_IN_SERVICE = "The plant health bulletins are not in service"
const ARCHIVE_NOT_IN_SERVICE =
  "The archive of the plant health bulletins is not in service"

const breadcrumbs = (cxt: Context, ...more: [string, string][]) => [
  Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: cxt.t("bsv_title"), method: "GET", href: "/bsv" }),
  ...more.map(([key, href]) =>
    Hypermedia.Link({ value: cxt.t(key), method: "GET", href }),
  ),
]

// Who wrote the bulletins, recalled wherever they are shown
function Attribution(props: { cxt: Context; archive?: boolean }) {
  return (
    <p>
      <small>
        {props.cxt.t("bsv_credit")}
        {props.archive ? (
          <span>
            {" "}
            {props.cxt.t("bsv_archive_credit")} <a href={ARCHIVE_URL}>PestObserver</a> —{" "}
            <a href={ARCHIVE_LICENCE_URL}>CC BY 4.0</a>.
          </span>
        ) : (
          ""
        )}
      </small>
    </p>
  )
}

function Caveat(props: { cxt: Context }) {
  return (
    <div class="notice">
      <p>{props.cxt.t("bsv_caveat")}</p>
    </div>
  )
}

const csvOf = (columns: string[], rows: Record<string, unknown>[]) => {
  const cell = (value: unknown) =>
    `"${String(Array.isArray(value) ? value.join("|") : (value ?? "")).replace(/"/g, '""')}"`

  return new Response(
    [
      columns.join(","),
      ...rows.map((row) => columns.map((c) => cell(row[c])).join(",")),
    ].join("\n") + "\n",
    { headers: { "Content-Type": "text/csv; charset=utf-8" } },
  )
}

const queryString = (values: Record<string, unknown>) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString()

function index(cxt: Context) {
  return (
    <Layout
      title={cxt.t("bsv_title")}
      breadcrumbs={breadcrumbs(cxt).slice(0, 1)}
      t={cxt.t}
    >
      <p class="prose">{cxt.t("bsv_introduction")}</p>
      <ul>
        <li>
          <a href="/bsv/risks">{cxt.t("bsv_risks_title")}</a>
        </li>
        <li>
          <a href="/bsv/search">{cxt.t("bsv_search_title")}</a>
        </li>
      </ul>
      <Attribution cxt={cxt} archive />
    </Layout>
  )
}

const levelOf = (cxt: Context, level: string) =>
  (LEVELS as readonly string[]).includes(level) ? cxt.t(`bsv_level_${level}`) : level

const bbchOf = (line: { "bbch-min"?: number; "bbch-max"?: number }) =>
  line["bbch-min"] === undefined
    ? ""
    : line["bbch-max"] === undefined || line["bbch-max"] === line["bbch-min"]
      ? ` (BBCH ${line["bbch-min"]})`
      : ` (BBCH ${line["bbch-min"]}–${line["bbch-max"]})`

function SourceCell(props: {
  cxt: Context
  line: RiskLine
  bulletin?: BulletinReference
}) {
  const { cxt, line, bulletin } = props

  return (
    <td>
      <q>{e(line["source-quote"])}</q>
      {bulletin ? (
        <span>
          <br />
          <a href={e(bulletin.links.self)}>{e(bulletin.citation ?? bulletin.id)}</a>
        </span>
      ) : (
        ""
      )}
      {line.page === undefined ? "" : `, ${cxt.t("bsv_page")} ${line.page}`}
      {bulletin?.["pdf-url"] ? (
        <span>
          {" "}
          · <a href={e(bulletin["pdf-url"])}>PDF</a>
        </span>
      ) : (
        ""
      )}
    </td>
  )
}

function RiskTable(props: {
  cxt: Context
  risks: (RiskLine & { bulletin?: BulletinReference })[]
}) {
  const { cxt } = props

  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{cxt.t("bsv_col_level")}</th>
            <th>{cxt.t("bsv_col_crop")}</th>
            <th>{cxt.t("bsv_col_pest")}</th>
            <th>{cxt.t("bsv_col_assessment")}</th>
            <th>{cxt.t("bsv_col_observations")}</th>
            <th>{cxt.t("bsv_col_source")}</th>
          </tr>
        </thead>
        <tbody>
          {props.risks.map((risk) => (
            <tr>
              <td>
                <b>{e(levelOf(cxt, risk.level))}</b>
                {risk.conditional ? (
                  <span>
                    <br />
                    <small>
                      {cxt.t("bsv_conditional")} {e(risk.condition ?? "")}
                    </small>
                  </span>
                ) : (
                  ""
                )}
              </td>
              <td>
                {e(risk.crop)}
                {risk.stage ? (
                  <span>
                    <br />
                    <small>{e(risk.stage + bbchOf(risk))}</small>
                  </span>
                ) : (
                  ""
                )}
              </td>
              <td>
                {e(risk.pest ?? "")}
                {risk["pest-type"] ? (
                  <span>
                    <br />
                    <small>{e(risk["pest-type"])}</small>
                  </span>
                ) : (
                  ""
                )}
              </td>
              <td>
                {e(risk["level-text"] ?? "")}
                {risk["risk-period"] ? (
                  <div>
                    <small>
                      {cxt.t("bsv_col_period")} : {e(risk["risk-period"])}
                    </small>
                  </div>
                ) : (
                  ""
                )}
                {risk.threshold ? (
                  <div>
                    <small>
                      {cxt.t("bsv_col_threshold")} : {e(risk.threshold)}
                    </small>
                  </div>
                ) : (
                  ""
                )}
              </td>
              <td>{e(risk.observations ?? "")}</td>
              <SourceCell cxt={cxt} line={risk} bulletin={risk.bulletin} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StageList(props: {
  cxt: Context
  stages: (CropStage & { bulletin?: BulletinReference })[]
}) {
  return props.stages.length === 0 ? (
    ""
  ) : (
    <section>
      <h2>{props.cxt.t("bsv_stages_title")}</h2>
      <ul>
        {props.stages.map((stage) => (
          <li>
            <b>{e(stage.crop)}</b> : {e((stage.stage ?? "") + bbchOf(stage))}
            {stage.bulletin ? (
              <small>
                {" "}
                —{" "}
                <a href={e(stage.bulletin.links.self)}>
                  {e(stage.bulletin["published-on"] ?? "")}
                </a>
              </small>
            ) : (
              ""
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

type RiskForm = {
  commune?: string
  department?: string
  crop?: string
  production?: string
  date?: string
}

const RISK_FIELDS = [
  ["commune", "bsv_field_commune", "220px"],
  ["department", "bsv_field_department", "80px"],
  ["crop", "bsv_field_crop", "160px"],
  ["production", "bsv_field_production", "160px"],
  ["date", "bsv_field_date", "130px"],
] as const

function RiskPage(props: {
  cxt: Context
  form: RiskForm
  place?: Place
  message?: string
  risks?: Risks
}) {
  const { cxt, form, risks } = props
  const search = queryString(form)

  return (
    <Layout title={cxt.t("bsv_risks_title")} breadcrumbs={breadcrumbs(cxt)} t={cxt.t}>
      <Caveat cxt={cxt} />
      <form method="get" action="/bsv/risks">
        {RISK_FIELDS.map(([name, label, width]) => (
          <label style={{ display: "inline-block", marginRight: "10px" }}>
            {cxt.t(label)}
            <br />
            <input
              class="field"
              name={name}
              type={name === "date" ? "date" : "text"}
              value={e(form[name] ?? "")}
              style={{ width }}
            />
          </label>
        ))}
        <button class="button primary" type="submit">
          {cxt.t("bsv_search")}
        </button>
      </form>

      {props.message ? <p class="quiet">{e(props.message)}</p> : ""}

      {risks === undefined ? (
        ""
      ) : (
        <div>
          <p>
            {props.place
              ? e(`${props.place.name} (${props.place["insee-code"]}) — `)
              : ""}
            {cxt.t("bsv_department")} {e(risks.department)}, {e(risks.date)}.{" "}
            <a href={`/bsv/risks.json?${e(search)}`}>JSON</a>,{" "}
            <a href={`/bsv/risks.csv?${e(search)}`}>CSV</a>
          </p>
          {risks.bulletins.length === 0 ? (
            <p class="quiet">{cxt.t("bsv_none")}</p>
          ) : (
            <div>
              {risks.stale ? <p class="notice">{cxt.t("bsv_stale")}</p> : ""}
              <h2>{cxt.t("bsv_bulletins_read")}</h2>
              <ul>
                {risks.bulletins.map((bulletin) => (
                  <li>
                    <a href={e(bulletin.links.self)}>
                      {e(bulletin.citation ?? bulletin.label ?? bulletin.id)}
                    </a>
                    {bulletin["pdf-url"] ? (
                      <span>
                        {" "}
                        · <a href={e(bulletin["pdf-url"])}>PDF</a>
                      </span>
                    ) : (
                      ""
                    )}
                  </li>
                ))}
              </ul>
              <h2>{cxt.t("bsv_risks_title")}</h2>
              <RiskTable cxt={cxt} risks={risks.risks} />
              <StageList cxt={cxt} stages={risks.stages} />
            </div>
          )}
        </div>
      )}
      <Attribution cxt={cxt} />
    </Layout>
  )
}

/**
 * The department a request names, through a commune given by its INSEE code,
 * its postal code or its name, or the department itself.
 */
async function departmentAsked(
  cxt: Context,
  form: RiskForm,
): Promise<{ department?: string; place?: Place; message?: string }> {
  if (form.commune) {
    const direct = departmentOf(form.commune)
    const place = await placeOf(cxt.db, form.commune)
    const department = direct ?? (place ? departmentOf(place["insee-code"]) : undefined)

    return department === undefined
      ? { message: cxt.t("bsv_unknown_place") }
      : { department, place }
  }
  if (form.department) {
    return isDepartment(form.department.toUpperCase())
      ? { department: form.department.toUpperCase() }
      : { message: cxt.t("bsv_unknown_place") }
  }

  return {}
}

const RISK_CSV_COLUMNS = [
  "level",
  "crop",
  "pest",
  "pest-type",
  "stage",
  "bbch-min",
  "bbch-max",
  "level-text",
  "conditional",
  "condition",
  "risk-period",
  "threshold",
  "observations",
  "page",
  "source-quote",
  "citation",
  "published-on",
  "pdf-url",
]

async function risks(cxt: Context) {
  const form: RiskForm = Object.fromEntries(
    RISK_FIELDS.map(([name]) => [name, cxt.query[name]?.trim() || undefined]).filter(
      ([, value]) => value !== undefined,
    ),
  )
  const asked = await departmentAsked(cxt, form)
  const query =
    asked.department === undefined
      ? undefined
      : riskQueryOf({ ...form, department: asked.department })

  if (query === undefined) {
    return cxt.output === "html"
      ? RiskPage({ cxt, form, message: asked.message ?? cxt.t("bsv_no_place") })
      : refusal(
          400,
          asked.message
            ? `No commune matches ${form.commune ?? form.department}`
            : "Give a commune (INSEE code, postal code or name) or a department",
        )
  }

  const found = await risksOf(cxt.db, query)

  if (found === undefined) {
    return refusal(404, NOT_IN_SERVICE)
  }
  if (cxt.output === "json") {
    return Response.json({
      "@id": new URL(cxt.request.url).pathname,
      title: cxt.t("bsv_risks_title"),
      caveat: cxt.t("bsv_caveat"),
      source: cxt.t("bsv_credit"),
      ...(asked.place ? { place: asked.place } : {}),
      ...(found.stale ? { "stale-note": cxt.t("bsv_stale") } : {}),
      "window-days": RECENT_DAYS,
      ...found,
    })
  }
  if (cxt.output === "csv") {
    return csvOf(
      RISK_CSV_COLUMNS,
      found.risks.map((risk) => ({
        ...risk,
        citation: risk.bulletin.citation,
        "published-on": risk.bulletin["published-on"],
        "pdf-url": risk.bulletin["pdf-url"],
      })),
    )
  }

  return RiskPage({ cxt, form, place: asked.place, risks: found })
}

const SEARCH_FIELDS = [
  ["q", "bsv_field_words", "280px"],
  ["department", "bsv_field_department", "80px"],
  ["from", "bsv_field_from", "110px"],
  ["to", "bsv_field_to", "110px"],
] as const

function SearchPage(props: {
  cxt: Context
  form: Record<string, string | undefined>
  query?: SearchQuery
  page: number
  found?: BulletinSearch
}) {
  const { cxt, form, found, page } = props
  const lastPage = found ? Math.max(1, Math.ceil(found.total / SEARCH_PAGE_SIZE)) : 1
  const pageLink = (number: number) =>
    `/bsv/search?${e(queryString({ ...form, page: number }))}`

  return (
    <Layout title={cxt.t("bsv_search_title")} breadcrumbs={breadcrumbs(cxt)} t={cxt.t}>
      <form method="get" action="/bsv/search">
        {SEARCH_FIELDS.map(([name, label, width]) => (
          <label style={{ display: "inline-block", marginRight: "10px" }}>
            {cxt.t(label)}
            <br />
            <input
              class="field"
              name={name}
              value={e(form[name] ?? "")}
              style={{ width }}
            />
          </label>
        ))}
        <label style={{ display: "inline-block", marginRight: "10px" }}>
          {cxt.t("bsv_field_corpus")}
          <br />
          <select class="field" name="corpus">
            {(["", "current", "archive"] as const).map((corpus) => (
              <option value={corpus} selected={(form.corpus ?? "") === corpus}>
                {cxt.t(`bsv_corpus_${corpus || "all"}`)}
              </option>
            ))}
          </select>
        </label>
        <button class="button primary" type="submit">
          {cxt.t("bsv_search")}
        </button>
      </form>

      {found === undefined ? (
        <p class="quiet">{cxt.t("bsv_search_help")}</p>
      ) : (
        <div>
          <p>
            {cxt.numberFormatter(found.total)} {cxt.t("bsv_results_count")}
            {found.relaxed ? ` — ${cxt.t("bsv_relaxed")}` : ""}.{" "}
            {found.corpora.archive === null
              ? `${cxt.t("bsv_archive_not_in_service")} `
              : ""}
            <a href={`/bsv/search.json?${e(queryString(form))}`}>JSON</a>,{" "}
            <a href={`/bsv/search.csv?${e(queryString(form))}`}>CSV</a>
          </p>
          {found.items.map((item) => (
            <div style={{ marginBottom: "14px" }}>
              <a href={e(item.links.self)}>
                <b>{e(item.title)}</b>
              </a>
              <br />
              <small>
                {e(
                  [
                    cxt.t(`bsv_corpus_${item.corpus}`),
                    item.date ?? item.year,
                    item.regions.join(", "),
                    item.page === undefined
                      ? undefined
                      : `${cxt.t("bsv_page")} ${item.page}`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                )}
              </small>
              {item.excerpt ? <div>{e(item.excerpt)}</div> : ""}
            </div>
          ))}
          <p>
            {page > 1 ? <a href={pageLink(page - 1)}>←</a> : ""} {page} / {lastPage}{" "}
            {page < lastPage ? <a href={pageLink(page + 1)}>→</a> : ""}
          </p>
        </div>
      )}
      <Attribution cxt={cxt} archive />
    </Layout>
  )
}

async function search(cxt: Context) {
  const form = Object.fromEntries(
    ["q", "department", "from", "to", "corpus"]
      .map((name) => [name, cxt.query[name]?.trim() || undefined])
      .filter(([, value]) => value !== undefined),
  )
  const query = searchQueryOf(form)
  const asked = Number(cxt.query.page)
  const page = Number.isInteger(asked) && asked > 0 ? asked : 1

  if (query === undefined) {
    return cxt.output === "html"
      ? SearchPage({ cxt, form, page })
      : refusal(400, "A search needs words: q")
  }

  const found = await searchBulletins(cxt.db, query, {
    limit: SEARCH_PAGE_SIZE,
    offset: (page - 1) * SEARCH_PAGE_SIZE,
  })

  if (found === undefined) {
    return refusal(404, NOT_IN_SERVICE)
  }
  if (cxt.output === "json") {
    return Response.json({
      "@id": new URL(cxt.request.url).pathname,
      title: cxt.t("bsv_search_title"),
      source: cxt.t("bsv_credit"),
      "archive-source": cxt.t("bsv_archive_credit") + " CC BY 4.0, " + ARCHIVE_URL,
      page,
      "items-count": found.total,
      ...found,
    })
  }
  if (cxt.output === "csv") {
    return csvOf(
      [
        "corpus",
        "id",
        "title",
        "date",
        "year",
        "regions",
        "page",
        "pdf-url",
        "article-url",
      ],
      found.items,
    )
  }

  return SearchPage({ cxt, form, query, page, found })
}

// The format is part of the last segment: /bsv/bulletins/f7aace8a.json
const idAndFormat = (param: string) => ({
  json: param.endsWith(".json"),
  id: decodeURIComponent(param.replace(/\.json$/, "")),
})

function BulletinPage(props: { cxt: Context; bulletin: BulletinRecord }) {
  const { cxt, bulletin } = props

  return (
    <Layout
      title={bulletin.citation ?? bulletin.label ?? bulletin.id}
      breadcrumbs={breadcrumbs(cxt, ["bsv_search_title", "/bsv/search"])}
      t={cxt.t}
    >
      <p>
        <small>
          {e(
            [
              bulletin["published-on"],
              bulletin.region,
              bulletin.sector,
              bulletin.subsector,
              bulletin.zone,
              bulletin.status,
            ]
              .filter(Boolean)
              .join(" · "),
          )}
        </small>
      </p>
      <ul>
        {bulletin["pdf-url"] ? (
          <li>
            <a href={e(bulletin["pdf-url"])}>{cxt.t("bsv_see_pdf")}</a>
          </li>
        ) : (
          ""
        )}
        {bulletin["article-url"] ? (
          <li>
            <a href={e(bulletin["article-url"])}>{cxt.t("bsv_see_article")}</a>
          </li>
        ) : (
          ""
        )}
        <li>
          <a href={`${e(bulletin.links.self)}.json`}>JSON</a>
        </li>
      </ul>
      {bulletin.risks.length > 0 || bulletin.stages.length > 0 ? (
        <section>
          <h2>{cxt.t("bsv_risks_of_bulletin")}</h2>
          <Caveat cxt={cxt} />
          <RiskTable cxt={cxt} risks={bulletin.risks} />
          <StageList cxt={cxt} stages={bulletin.stages} />
        </section>
      ) : (
        ""
      )}
      {bulletin.pages.length > 0 ? (
        <section>
          <h2>{cxt.t("bsv_pages_title")}</h2>
          {bulletin.pages.map((page) => (
            <details>
              <summary>
                {cxt.t("bsv_page")} {page.page}
              </summary>
              <p class="prose" style={{ whiteSpace: "pre-wrap" }}>
                {e(page.text)}
              </p>
            </details>
          ))}
        </section>
      ) : (
        ""
      )}
      <Attribution cxt={cxt} />
    </Layout>
  )
}

async function bulletin(cxt: Context) {
  const { json, id } = idAndFormat(cxt.params.id)
  const found = await bulletinOf(cxt.db, id)

  if (found === undefined) {
    return refusal(404, NOT_IN_SERVICE)
  }
  if (found === null) {
    return refusal(404, `No bulletin ${id}`)
  }

  return json
    ? Response.json({
        caveat: cxt.t("bsv_caveat"),
        source: cxt.t("bsv_credit"),
        ...found,
      })
    : BulletinPage({ cxt, bulletin: found })
}

function ArchivePage(props: { cxt: Context; document: ArchiveDocument }) {
  const { cxt, document } = props

  return (
    <Layout
      title={document.title ?? document["file-name"]}
      breadcrumbs={breadcrumbs(cxt, ["bsv_search_title", "/bsv/search"])}
      t={cxt.t}
    >
      <p>
        <small>
          {e(
            [
              cxt.t(`bsv_corpus_archive`),
              document.date ?? document.year,
              document.kind,
              (document.regions.length > 0
                ? document.regions
                : document["old-regions"]
              ).join(", "),
              document.sectors.join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
          )}
        </small>
      </p>
      <p>
        <a href={`${e(document.links.self)}.json`}>JSON</a>
      </p>
      <p class="prose" style={{ whiteSpace: "pre-wrap" }}>
        {e(document.text)}
      </p>
      <Attribution cxt={cxt} archive />
    </Layout>
  )
}

async function archive(cxt: Context) {
  const { json, id } = idAndFormat(cxt.params.id)
  const found = await archiveDocumentOf(cxt.db, id)

  if (found === undefined) {
    return refusal(404, ARCHIVE_NOT_IN_SERVICE)
  }
  if (found === null) {
    return refusal(404, `No document ${id} in the archive`)
  }

  return json
    ? Response.json({
        source: cxt.t("bsv_archive_credit") + " CC BY 4.0, " + ARCHIVE_URL,
        ...found,
      })
    : ArchivePage({ cxt, document: found })
}

export const Bsv = API.new()
  .path("/bsv", index)
  .path("/bsv/risks", risks)
  .path("/bsv/search", search)
  .path("/bsv/bulletins/:id", bulletin)
  .path("/bsv/archive/:id", archive)
