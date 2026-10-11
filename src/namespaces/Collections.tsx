import { Html } from "@elysiajs/html"
import { API } from "../API"
import { csvOf, datasetsOf, KINDS } from "../collections/Collect"
import { documentOf, findSharedCollection } from "../collections/CollectionStore"
import { EDITOR_PATH, editorLink, relayEditor, SHARED_PATH } from "../collections/Editor"
import { Hypermedia } from "../Hypermedia"
import { Layout } from "../templates/layouts/Layout"
import type { Context } from "../types/Context"
import { e } from "./Admin/AdminLayout"

// A collection a member shares is read at an address that cannot be guessed, by
// anyone who has it and without an account: on the map, as GeoJSON or as a table.
// Nothing can be changed from there.

const PREVIEW_ROWS = 20
const PREVIEW_COLUMNS = 8
// Never listed by a search engine, never passed on to the sites it links to
const PRIVATE_LINK = { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

const day = (date: Date | string) => new Date(date).toISOString().slice(0, 10)

const unknown = () =>
  new Response("Cette collecte n'existe pas, ou n'est plus partagée.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...PRIVATE_LINK },
  })

async function shared(cxt: Context) {
  const collection = await findSharedCollection(cxt.db, cxt.params.share)

  if (collection === undefined) {
    return unknown()
  }

  const document = await documentOf(cxt.db, collection)
  const base = `${SHARED_PATH}/${collection.share_id}`
  const editor = editorLink(base)
  const features = document.features.slice(0, PREVIEW_ROWS)
  const columns = [
    ...new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))),
  ].slice(0, PREVIEW_COLUMNS)
  const labels = datasetsOf(collection.kind)
    .filter((dataset) => collection.datasets.includes(dataset.key))
    .map((dataset) => dataset.label.toLowerCase())

  return new Response(
    (
      <Layout
        title={e(collection.name)}
        breadcrumbs={[Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" })]}
        t={cxt.t}
      >
        <p class="prose">
          Collecte partagée par {e(collection.owner ?? "un adhérent d'OSFarm")} :{" "}
          {cxt.numberFormatter(collection.features)} objets,{" "}
          {e((KINDS[collection.kind] ?? "").toLowerCase())}
          {labels.length > 0 ? `, avec ${e(labels.join(", "))}` : ""}. Données du Lexicon
          lues le {day(collection.collected_at)}, retravaillées pour la dernière fois le{" "}
          {day(collection.updated_at)}.
        </p>
        <p>
          {editor === undefined ? (
            ""
          ) : (
            <a class="button primary" href={editor}>
              Voir sur la carte
            </a>
          )}{" "}
          <a class="button" href={`${base}/data`} download="collecte.geojson">
            Télécharger le GeoJSON
          </a>{" "}
          <a class="button" href={`${base}/csv`}>
            Télécharger le tableau (CSV)
          </a>
        </p>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th>{e(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr>
                {columns.map((column) => {
                  const value = feature.properties?.[column]

                  return (
                    <td>
                      {e(
                        value === undefined || value === null
                          ? ""
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value).slice(0, 80),
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {document.features.length > features.length ? (
          <p class="prose">
            Les {features.length} premiers objets sur{" "}
            {cxt.numberFormatter(document.features.length)} ; le téléchargement les donne
            tous, avec toutes leurs propriétés.
          </p>
        ) : (
          ""
        )}
      </Layout>
    ) as any,
    { headers: { "Content-Type": "text/html; charset=utf-8", ...PRIVATE_LINK } },
  )
}

async function sharedData(cxt: Context) {
  const collection =
    cxt.request.method === "GET"
      ? await findSharedCollection(cxt.db, cxt.params.share)
      : undefined

  return collection === undefined
    ? unknown()
    : Response.json(await documentOf(cxt.db, collection), {
        headers: { "Content-Type": "application/geo+json", ...PRIVATE_LINK },
      })
}

/**
 * What the editor needs to know of the collection it opens: a shared one is read, never saved.
 */
async function sharedSession(cxt: Context) {
  const collection = await findSharedCollection(cxt.db, cxt.params.share)

  return collection === undefined
    ? unknown()
    : Response.json(
        {
          name: collection.name,
          editable: false,
          back: `${SHARED_PATH}/${collection.share_id}`,
        },
        { headers: PRIVATE_LINK },
      )
}

async function sharedCsv(cxt: Context) {
  const collection = await findSharedCollection(cxt.db, cxt.params.share)

  return collection === undefined
    ? unknown()
    : new Response(csvOf(await documentOf(cxt.db, collection)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="collecte.csv"',
          ...PRIVATE_LINK,
        },
      })
}

export const Collections = API.new()
  .path(EDITOR_PATH, (cxt) => relayEditor(cxt.request))
  .path(EDITOR_PATH + "/*", (cxt) => relayEditor(cxt.request))
  .path(SHARED_PATH + "/:share", shared)
  .path(SHARED_PATH + "/:share/data", sharedData)
  .path(SHARED_PATH + "/:share/session", sharedSession)
  .path(SHARED_PATH + "/:share/csv", sharedCsv)
