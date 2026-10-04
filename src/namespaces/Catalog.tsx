import { Html } from "@elysiajs/html"
import { API } from "../API"
import { readCatalog, type Dataset } from "../catalog/Catalog"
import { Hypermedia } from "../Hypermedia"
import { Layout } from "../templates/layouts/Layout"
import type { Context } from "../types/Context"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const day = (iso: string | null) => (iso === null ? "—" : iso.slice(0, 10))

const breadcrumbs = (cxt: Context, withCatalog: boolean) => [
  Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
  ...(withCatalog
    ? [Hypermedia.Link({ value: "Catalogue", method: "GET", href: "/catalog" })]
    : []),
]

const unavailable = () =>
  Response.json(
    { error: { status: 404, message: "This database has no registry of packages" } },
    { status: 404 },
  )

const CSV_COLUMNS = [
  "name",
  "version",
  "loaded-at",
  "stale",
  "scope",
  "provider",
  "licence",
  "source-date",
  "rows",
] as const

function csvOf(datasets: Dataset[]) {
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`

  return [
    CSV_COLUMNS.join(","),
    ...datasets.map((dataset) =>
      CSV_COLUMNS.map((column) => cell(dataset[column])).join(","),
    ),
  ].join("\n")
}

function ListPage(props: { cxt: Context; datasets: Dataset[] }) {
  return (
    <Layout title="Catalogue" breadcrumbs={breadcrumbs(props.cxt, false)} t={props.cxt.t}>
      <p>
        {props.datasets.length} jeux de données en service. Formats :{" "}
        <a href="/catalog.json">JSON</a>, <a href="/catalog.csv">CSV</a>.
      </p>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            {[
              "Jeu",
              "Version",
              "Source du",
              "Fournisseur",
              "Licence",
              "Lignes",
              "Accès",
            ].map((column) => (
              <th style={{ textAlign: "left" }}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.datasets.map((dataset) => (
            <tr>
              <td>
                <a href={e(dataset.href)}>{e(dataset.name)}</a>
              </td>
              <td>
                {e(dataset.version)}
                {dataset.stale ? " (périmé)" : ""}
              </td>
              <td>{e(day(dataset["source-date"]))}</td>
              <td>{e(dataset.provider ?? "—")}</td>
              <td>{e(dataset.licence ?? "—")}</td>
              <td>{props.cxt.numberFormatter(dataset.rows)}</td>
              <td>{dataset.scope === "open" ? "ouvert" : "adhérents"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

function DetailPage(props: { cxt: Context; dataset: Dataset }) {
  const { dataset, cxt } = props

  return (
    <Layout title={dataset.name} breadcrumbs={breadcrumbs(cxt, true)} t={cxt.t}>
      <p>{e(dataset.description ?? "")}</p>
      <ul>
        <li>
          <b>Version en service :</b> {e(dataset.version)}, chargée le{" "}
          {e(day(dataset["loaded-at"]))}
          {dataset.stale ? " — périmée : une de ses dépendances a changé depuis" : ""}
        </li>
        <li>
          <b>Source :</b> {e(dataset.provider ?? "—")}, données du{" "}
          {e(day(dataset["source-date"]))}
          {dataset["source-url"] ? (
            <span>
              {" "}
              (<a href={e(dataset["source-url"])}>site</a>)
            </span>
          ) : (
            ""
          )}
        </li>
        <li>
          <b>Licence :</b>{" "}
          {dataset["licence-url"] ? (
            <a href={e(dataset["licence-url"])}>{e(dataset.licence ?? "—")}</a>
          ) : (
            e(dataset.licence ?? "—")
          )}
        </li>
        <li>
          <b>Accès :</b>{" "}
          {dataset.scope === "open"
            ? "ouvert à tous"
            : "réservé aux adhérents (clé d'API)"}
        </li>
      </ul>

      <h2>Tables</h2>
      <ul>
        {dataset.tables.map((table) => (
          <li>
            <code>{e(table.name)}</code> — {cxt.numberFormatter(table.rows)} lignes
          </li>
        ))}
      </ul>

      {dataset["depends-on"].length > 0 ? (
        <div>
          <h2>Dépend de</h2>
          <ul>
            {dataset["depends-on"].map((dependency) => (
              <li>
                <a href={`/catalog/${e(dependency.name)}`}>{e(dependency.name)}</a>{" "}
                (construit contre {e(dependency["built-against"] ?? "?")}, en service :{" "}
                {e(dependency["in-service"] ?? "absent")})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        ""
      )}

      {dataset.pivots.length > 0 ? (
        <div>
          <h2>Clés de liaison</h2>
          <ul>
            {dataset.pivots.map((pivot) => (
              <li>
                <code>
                  {e(pivot.table)}.{e(pivot.column)}
                </code>{" "}
                → {e(pivot.key)} :{" "}
                {pivot.rate === null
                  ? "non mesuré"
                  : `${Math.round(pivot.rate * 1000) / 10} % reliés`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        ""
      )}

      {dataset.versions.length > 0 ? (
        <div>
          <h2>Versions disponibles</h2>
          <ul>
            {dataset.versions.map((entry) => (
              <li>
                {entry.download ? (
                  <a href={e(entry.download)}>{e(entry.version)}</a>
                ) : (
                  e(entry.version)
                )}
                {entry.current ? " (en service)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        ""
      )}
    </Layout>
  )
}

async function list(cxt: Context) {
  const datasets = await readCatalog(cxt.db)

  if (datasets === undefined) {
    return unavailable()
  }
  if (cxt.output === "json") {
    return Response.json({
      "@id": new URL(cxt.request.url).pathname,
      title: "Catalogue",
      "items-count": datasets.length,
      datasets,
    })
  }
  if (cxt.output === "csv") {
    return new Response(csvOf(datasets) + "\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    })
  }

  return ListPage({ cxt, datasets })
}

async function detail(cxt: Context) {
  // The format is part of the last segment: /catalog/units.json
  const [name, format] = cxt.params.name.split(".")
  const dataset = (await readCatalog(cxt.db))?.find(
    (candidate) => candidate.name === name,
  )

  if (dataset === undefined) {
    return Response.json(
      { error: { status: 404, message: `No dataset ${name} in service` } },
      { status: 404 },
    )
  }

  return format === "json" ? Response.json(dataset) : DetailPage({ cxt, dataset })
}

export const Catalog = API.new().path("/catalog", list).path("/catalog/:name", detail)
