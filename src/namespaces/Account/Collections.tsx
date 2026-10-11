import { Html } from "@elysiajs/html"
import { csrfTokenMatches, csrfTokenOf } from "../../access/AdminSession"
import { memberTokenIn } from "../../access/MemberSession"
import { findSessionMember } from "../../access/MemberStore"
import {
  collect,
  communeName,
  communesMatching,
  countParcels,
  csvOf,
  datasetsOf,
  describeZone,
  featureCollectionIn,
  KINDS,
  MAXIMUM_DOCUMENT_BYTES,
  MAXIMUM_PARCELS,
  MAXIMUM_RADIUS_IN_METRES,
  sectionsOf,
  zoneIn,
  type Criteria,
  type FeatureCollection,
  type Kind,
} from "../../collections/Collect"
import {
  countCollections,
  createCollection,
  deleteCollection,
  documentOf,
  duplicateCollection,
  findCollection,
  listCollections,
  MAXIMUM_COLLECTIONS,
  MAXIMUM_NAME_LENGTH,
  renameCollection,
  saveDocument,
  shareCollection,
  unshareCollection,
  type Collection,
} from "../../collections/CollectionStore"
import { editorLink, SHARED_PATH } from "../../collections/Editor"
import type { Context } from "../../types/Context"
import { e, Table } from "../Admin/AdminLayout"
import { redirect } from "../Admin/session"
import { Hidden, Layout, text } from "./parts"
import { membered, type MemberRequest } from "./session"

const PREVIEW_ROWS = 10
const PREVIEW_COLUMNS = 8
const HOME = "/account/collections"

const moment = (date: Date | string) =>
  new Date(date).toISOString().slice(0, 16).replace("T", " ")

const isKind = (value: string): value is Kind => value === "cadastre" || value === "pac"

const pathOf = (collection: Pick<Collection, "id">) => `${HOME}/${collection.id}`

/**
 * The address anyone reads a shared collection at, as the member copies it.
 */
function sharedAddress(cxt: Context, collection: Collection): string {
  const url = new URL(cxt.request.url)
  const scheme = cxt.request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  const site =
    import.meta.env.PUBLIC_URL?.replace(/\/+$/, "") ||
    `${scheme}://${cxt.request.headers.get("host") ?? url.host}`

  return `${site}${SHARED_PATH}/${collection.share_id}`
}

// --- the list

export const collections = membered(async (request) => {
  const all = await listCollections(request.cxt.db, request.member.id)

  return (
    <Layout title="Mes collectes" request={request}>
      <p>
        Une collecte rassemble des parcelles, cadastrales ou déclarées à la PAC, avec ce
        que le Lexicon sait de chacune. Elle se retravaille sur la carte, s'exporte et se
        partage par un lien.
      </p>
      <p>
        {all.length < MAXIMUM_COLLECTIONS ? (
          <a class="button" href={`${HOME}/new`}>
            Nouvelle collecte
          </a>
        ) : (
          `Vous avez ${MAXIMUM_COLLECTIONS} collectes, le maximum : supprimez-en une pour en créer une autre.`
        )}
      </p>
      <Table
        empty="Vous n'avez pas encore de collecte."
        columns={["Collecte", "Parcelles", "Objets", "Collectée le", "Modifiée le", "Partage"]}
        rows={all.map((collection) => [
          <a href={pathOf(collection)}>{e(collection.name)}</a>,
          e(KINDS[collection.kind] ?? collection.kind),
          request.cxt.numberFormatter(collection.features),
          moment(collection.collected_at),
          moment(collection.updated_at),
          collection.share_id === null ? "privée" : "lien public",
        ])}
      />
    </Layout>
  )
})

// --- the guided steps

type Answers = Record<string, string>

const CARRIED = [
  "name",
  "kind",
  "by",
  "commune",
  "commune_search",
  "latitude",
  "longitude",
  "radius",
  "identifiers",
  "filter",
]

function Carried(props: { answers: Answers; except?: string[] }) {
  return (
    <span>
      {CARRIED.filter((name) => !(props.except ?? []).includes(name)).map((name) => (
        <input type="hidden" name={name} value={e(props.answers[name] ?? "")} />
      ))}
    </span>
  )
}

function Steps(props: { current: number }) {
  const steps = ["La collecte", "Les parcelles", "Les données"]

  return (
    <ol class="steps">
      {steps.map((label, index) => (
        <li aria-current={index + 1 === props.current ? "step" : undefined}>
          {index + 1 === props.current ? <b>{label}</b> : label}
        </li>
      ))}
    </ol>
  )
}

function Problem(props: { message?: string }) {
  return props.message ? <p class="card error">{e(props.message)}</p> : ""
}

function StepOne(props: { request: MemberRequest; answers: Answers; problem?: string }) {
  const { answers } = props

  return (
    <Layout title="Nouvelle collecte" request={props.request}>
      <Steps current={1} />
      <Problem message={props.problem} />
      <form method="POST" action={`${HOME}/new`}>
        <Hidden csrf={props.request.csrf} />
        <input type="hidden" name="step" value="1" />
        <Carried answers={answers} except={["name", "kind"]} />
        <div class="field">
          <label for="name">Nom de la collecte</label>
          <br />
          <input
            type="text"
            name="name"
            id="name"
            required
            maxlength={String(MAXIMUM_NAME_LENGTH)}
            placeholder="Parcelles du bourg de Saint-Porchaire"
            value={e(answers.name ?? "")}
          />
        </div>
        <fieldset>
          <legend>Quelles parcelles ?</legend>
          {(Object.keys(KINDS) as Kind[]).map((kind) => (
            <p>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  required
                  checked={(answers.kind || "cadastre") === kind}
                />{" "}
                {e(KINDS[kind])}
              </label>
            </p>
          ))}
        </fieldset>
        <button class="button" type="submit">
          Continuer
        </button>
      </form>
    </Layout>
  )
}

function StepTwo(props: {
  request: MemberRequest
  answers: Answers
  problem?: string
  communes?: { code: string; name: string; postalCodes: string }[]
  sections?: { section: string; parcels: number }[]
}) {
  const { answers } = props
  const kind = answers.kind as Kind
  const by = answers.by || "commune"

  return (
    <Layout title="Nouvelle collecte" request={props.request}>
      <Steps current={2} />
      <Problem message={props.problem} />
      <p>
        <b>{e(answers.name)}</b> — {e(KINDS[kind])}. Une collecte garde au plus{" "}
        {MAXIMUM_PARCELS} parcelles.
      </p>
      <form method="POST" action={`${HOME}/new`}>
        <Hidden csrf={props.request.csrf} />
        <input type="hidden" name="step" value="2" />
        <input type="hidden" name="name" value={e(answers.name)} />
        <input type="hidden" name="kind" value={e(kind)} />

        <fieldset>
          <legend>
            <label>
              <input type="radio" name="by" value="commune" checked={by === "commune"} /> Dans
              une commune
            </label>
          </legend>
          {props.communes && props.communes.length > 1 ? (
            <div>
              <p>Plusieurs communes correspondent, choisissez :</p>
              {props.communes.map((commune) => (
                <p>
                  <label>
                    <input type="radio" name="commune" value={e(commune.code)} />{" "}
                    {e(commune.name)} ({e(commune.code)}, {e(commune.postalCodes)})
                  </label>
                </p>
              ))}
            </div>
          ) : (
            <input type="hidden" name="commune" value={e(answers.commune ?? "")} />
          )}
          <div class="field">
            <label for="commune_search">Nom, code INSEE ou code postal</label>
            <br />
            <input
              type="text"
              name="commune_search"
              id="commune_search"
              placeholder="Saint-Porchaire, 17387 ou 17250"
              value={e(answers.commune_search ?? "")}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <label>
              <input type="radio" name="by" value="point" checked={by === "point"} /> Autour
              d'un point
            </label>
          </legend>
          <div class="field">
            <label for="latitude">Latitude</label>
            <br />
            <input
              type="text"
              name="latitude"
              id="latitude"
              inputmode="decimal"
              placeholder="45.8231"
              value={e(answers.latitude ?? "")}
            />
          </div>
          <div class="field">
            <label for="longitude">Longitude</label>
            <br />
            <input
              type="text"
              name="longitude"
              id="longitude"
              inputmode="decimal"
              placeholder="-0.7830"
              value={e(answers.longitude ?? "")}
            />
          </div>
          <div class="field">
            <label for="radius">Rayon en mètres (jusqu'à {MAXIMUM_RADIUS_IN_METRES})</label>
            <br />
            <input
              type="number"
              name="radius"
              id="radius"
              min="10"
              max={String(MAXIMUM_RADIUS_IN_METRES)}
              value={e(answers.radius || "500")}
            />
          </div>
          <p>
            Les coordonnées d'un lieu se lisent sur{" "}
            <a href="/tools/parcel-identifier" target="_blank">
              l'identificateur de parcelle
            </a>
            .
          </p>
        </fieldset>

        <fieldset>
          <legend>
            <label>
              <input
                type="radio"
                name="by"
                value="identifiers"
                checked={by === "identifiers"}
              />{" "}
              Par leurs identifiants
            </label>
          </legend>
          <div class="field">
            <label for="identifiers">
              {kind === "cadastre"
                ? "Identifiants cadastraux (17387000AV0659), séparés par des espaces ou des retours à la ligne"
                : "Identifiants des parcelles du RPG, séparés par des espaces ou des retours à la ligne"}
            </label>
            <br />
            <textarea name="identifiers" id="identifiers" rows="3" cols="50">{e(answers.identifiers ?? "")}</textarea>
          </div>
        </fieldset>

        <div class="field">
          <label for="filter">
            {kind === "cadastre"
              ? "Ne garder qu'une section cadastrale (facultatif)"
              : "Ne garder qu'une culture : son code PAC ou une partie de son nom (facultatif)"}
          </label>
          <br />
          <input
            type="text"
            name="filter"
            id="filter"
            placeholder={kind === "cadastre" ? "AV" : "maïs"}
            value={e(answers.filter ?? "")}
          />
        </div>
        {props.sections && props.sections.length > 0 ? (
          <details open>
            <summary>Les sections de la commune</summary>
            <p>
              {props.sections
                .map((section) => `${e(section.section)} (${section.parcels})`)
                .join(" · ")}
            </p>
          </details>
        ) : (
          ""
        )}
        <button class="button" type="submit">
          Compter les parcelles
        </button>
      </form>
      <form method="POST" action={`${HOME}/new`}>
        <Hidden csrf={props.request.csrf} />
        <input type="hidden" name="step" value="0" />
        <Carried answers={answers} />
        <button class="button small" type="submit">
          Revenir au nom et au type
        </button>
      </form>
    </Layout>
  )
}

function StepThree(props: {
  request: MemberRequest
  answers: Answers
  count: number
  zone: string
  chosen?: string[]
  problem?: string
}) {
  const { answers } = props
  const kind = answers.kind as Kind

  return (
    <Layout title="Nouvelle collecte" request={props.request}>
      <Steps current={3} />
      <Problem message={props.problem} />
      <p>
        <b>{e(answers.name)}</b> — {props.request.cxt.numberFormatter(props.count)}{" "}
        {e(KINDS[kind].toLowerCase())}, {e(props.zone)}
        {answers.filter ? `, filtre « ${e(answers.filter)} »` : ""}.
      </p>
      <form method="POST" action={`${HOME}/new`}>
        <Hidden csrf={props.request.csrf} />
        <input type="hidden" name="step" value="3" />
        <Carried answers={answers} />
        <fieldset>
          <legend>Que joindre à chaque parcelle ?</legend>
          <p>
            {kind === "cadastre"
              ? "Chaque parcelle porte déjà son identifiant, sa section, son numéro et sa surface."
              : "Chaque parcelle porte déjà son identifiant, sa culture, sa campagne et sa surface."}
          </p>
          {datasetsOf(kind).map((dataset) => (
            <p>
              <label>
                <input
                  type="checkbox"
                  name="datasets"
                  value={dataset.key}
                  checked={props.chosen === undefined || props.chosen.includes(dataset.key)}
                />{" "}
                <b>{e(dataset.label)}</b> : {e(dataset.detail)}
              </label>
            </p>
          ))}
        </fieldset>
        <p>
          Les données sont lues maintenant et ne changent plus ensuite : la collecte garde
          sa date.
        </p>
        <button class="button" type="submit">
          Collecter
        </button>
      </form>
      <form method="POST" action={`${HOME}/new`}>
        <Hidden csrf={props.request.csrf} />
        <input type="hidden" name="step" value="1" />
        <Carried answers={answers} />
        <button class="button small" type="submit">
          Revenir au choix des parcelles
        </button>
      </form>
    </Layout>
  )
}

export const newCollection = membered(async (request) => {
  const { cxt, member, form } = request
  const answers: Answers = Object.fromEntries(CARRIED.map((name) => [name, text(form, name)]))
  const step = Number(text(form, "step") || "0")

  if ((await countCollections(cxt.db, member.id)) >= MAXIMUM_COLLECTIONS) {
    return redirect(HOME)
  }

  // Step 1: a name and a kind of parcels
  if (form === undefined || step < 1) {
    return <StepOne request={request} answers={answers} />
  }

  answers.name = answers.name.slice(0, MAXIMUM_NAME_LENGTH)
  if (answers.name === "" || !isKind(answers.kind)) {
    return (
      <StepOne
        request={request}
        answers={answers}
        problem="Donnez un nom à la collecte et choisissez ses parcelles."
      />
    )
  }
  if (step < 2) {
    return <StepTwo request={request} answers={answers} />
  }

  // Step 2: the zone. A commune typed by its name is looked for, and chosen when it is the only one
  const kind = answers.kind
  const isCode = /^(\d{5}|2[AB]\d{3})$/i.test(answers.commune)
  const matching =
    answers.by === "commune" && !isCode
      ? await communesMatching(cxt.db, answers.commune_search)
      : []

  if (answers.by === "commune" && !isCode) {
    if (matching.length !== 1) {
      return (
        <StepTwo
          request={request}
          answers={answers}
          communes={matching}
          problem={
            matching.length === 0
              ? "Aucune commune ne correspond : donnez son nom, son code INSEE ou son code postal."
              : undefined
          }
        />
      )
    }

    answers.commune = matching[0].code
  }

  const read = zoneIn(kind, answers)
  if ("problem" in read) {
    return <StepTwo request={request} answers={answers} problem={read.problem} />
  }

  const criteria: Criteria = { kind, zone: read.zone, filter: answers.filter || undefined }
  const count = await countParcels(cxt.db, criteria)
  const zone = describeZone(
    read.zone,
    read.zone.by === "commune" ? await communeName(cxt.db, read.zone.inseeCode) : undefined,
  )

  if (count === 0 || count > MAXIMUM_PARCELS) {
    const sections =
      kind === "cadastre" && read.zone.by === "commune"
        ? await sectionsOf(cxt.db, read.zone.inseeCode)
        : undefined

    return (
      <StepTwo
        request={request}
        answers={answers}
        sections={count > MAXIMUM_PARCELS ? sections : undefined}
        problem={
          count === 0
            ? `Aucune parcelle ne correspond (${zone}).`
            : `Plus de ${MAXIMUM_PARCELS} parcelles correspondent (${zone}) : resserrez la zone${kind === "cadastre" ? ", par exemple à une section" : " ou filtrez sur une culture"}.`
        }
      />
    )
  }
  if (step < 3) {
    return <StepThree request={request} answers={answers} count={count} zone={zone} />
  }

  // Step 3: the datasets, then the collection itself
  const chosen = (form.getAll("datasets") as string[]).filter((key) =>
    datasetsOf(kind).some((dataset) => dataset.key === key),
  )
  const document = await collect(cxt.db, criteria, chosen)
  const id =
    document === undefined
      ? undefined
      : await createCollection(cxt.db, member.id, {
          name: answers.name,
          criteria,
          datasets: chosen,
          document,
        })

  return id === undefined ? (
    <StepThree
      request={request}
      answers={answers}
      count={count}
      zone={zone}
      chosen={chosen}
      problem="La collecte n'a pas pu être créée. Réessayez."
    />
  ) : (
    redirect(`${HOME}/${id}`)
  )
})

// --- one collection

function Preview(props: { document: FeatureCollection }) {
  const features = props.document.features.slice(0, PREVIEW_ROWS)
  const columns = [
    ...new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))),
  ]
  const shown = columns.slice(0, PREVIEW_COLUMNS)

  return (
    <div>
      <Table
        empty="La collecte ne contient aucun objet."
        columns={shown}
        rows={features.map((feature) =>
          shown.map((column) => {
            const value = feature.properties?.[column]

            return e(
              value === undefined || value === null
                ? ""
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value).slice(0, 80),
            )
          }),
        )}
      />
      {columns.length > shown.length ? (
        <p>
          Et {columns.length - shown.length} autres propriétés :{" "}
          {e(columns.slice(PREVIEW_COLUMNS).join(", "))}.
        </p>
      ) : (
        ""
      )}
    </div>
  )
}

export const collectionDetail = membered(async (request) => {
  const { cxt, member, csrf, form } = request
  const collection = await findCollection(cxt.db, member.id, cxt.params.id)

  if (collection === undefined) {
    return new Response("Collecte inconnue", { status: 404 })
  }

  const action = text(form, "action")
  const name = text(form, "name").slice(0, MAXIMUM_NAME_LENGTH)

  if (action === "rename" && name !== "") {
    await renameCollection(cxt.db, collection, name)
  }
  if (action === "share") {
    await shareCollection(cxt.db, collection)
  }
  if (action === "unshare") {
    await unshareCollection(cxt.db, collection)
  }
  if (action === "duplicate") {
    const copy = await duplicateCollection(
      cxt.db,
      collection,
      `${collection.name} (copie)`.slice(0, MAXIMUM_NAME_LENGTH),
    )

    return redirect(copy === undefined ? HOME : `${HOME}/${copy}`)
  }
  if (action === "delete") {
    await deleteCollection(cxt.db, collection)

    return redirect(HOME)
  }
  if (form !== undefined) {
    return redirect(pathOf(collection))
  }

  const document = await documentOf(cxt.db, collection)
  const zone = describeZone(
    collection.criteria.zone,
    collection.criteria.zone.by === "commune"
      ? await communeName(cxt.db, collection.criteria.zone.inseeCode)
      : undefined,
  )
  const labels = datasetsOf(collection.kind)
    .filter((dataset) => collection.datasets.includes(dataset.key))
    .map((dataset) => dataset.label.toLowerCase())
  const editor = editorLink(pathOf(collection))

  return (
    <Layout title={collection.name} request={request}>
      <Table
        columns={["", ""]}
        rows={[
          ["Parcelles", e(KINDS[collection.kind] ?? collection.kind)],
          [
            "Zone",
            e(zone + (collection.criteria.filter ? `, filtre « ${collection.criteria.filter} »` : "")),
          ],
          ["Données jointes", e(labels.join(", ") || "aucune")],
          ["Objets", cxt.numberFormatter(collection.features)],
          ["Collectée le", moment(collection.collected_at)],
          ["Modifiée le", moment(collection.updated_at)],
        ]}
      />
      <p>
        {editor === undefined ? (
          <i>L'éditeur cartographique n'est pas en service sur ce site.</i>
        ) : (
          <a class="button primary" href={editor}>
            Ouvrir sur la carte
          </a>
        )}{" "}
        <a class="button" href={`${pathOf(collection)}/data`} download={`${e(collection.name)}.geojson`}>
          Télécharger le GeoJSON
        </a>{" "}
        <a class="button" href={`${pathOf(collection)}/csv`}>
          Télécharger le tableau (CSV)
        </a>
      </p>

      <h2>Aperçu</h2>
      <Preview document={document} />

      <h2>Partage</h2>
      {collection.share_id === null ? (
        <form method="POST">
          <Hidden csrf={csrf} action="share" />
          <p>
            La collecte n'est visible que de vous. Un lien public la donne à lire, sur la
            carte et en téléchargement, à toute personne qui le reçoit, sans compte.
            {collection.datasets.includes("proprietaires")
              ? " Elle contient les propriétaires, donnée réservée aux adhérents : le lien les donne aussi."
              : ""}
          </p>
          <button class="button" type="submit">
            Créer un lien public
          </button>
        </form>
      ) : (
        <div>
          <p>Toute personne qui a ce lien lit la collecte, sans pouvoir la modifier :</p>
          <p class="card info">
            <code style={{ userSelect: "all", wordBreak: "break-all" }}>
              {e(sharedAddress(cxt, collection))}
            </code>
          </p>
          {collection.datasets.includes("proprietaires") ? (
            <p>
              Elle contient les propriétaires, donnée réservée aux adhérents : le lien les
              donne aussi.
            </p>
          ) : (
            ""
          )}
          <form method="POST">
            <Hidden csrf={csrf} action="unshare" />
            <button class="button" type="submit">
              Arrêter le partage (le lien cesse de fonctionner)
            </button>
          </form>
        </div>
      )}

      <h2>Gérer</h2>
      <form method="POST">
        <Hidden csrf={csrf} action="rename" />
        <label for="name">Nom </label>
        <input
          type="text"
          name="name"
          id="name"
          required
          maxlength={String(MAXIMUM_NAME_LENGTH)}
          value={e(collection.name)}
        />
        <button class="button" type="submit">
          Renommer
        </button>
      </form>
      <form method="POST">
        <Hidden csrf={csrf} action="duplicate" />
        <button class="button" type="submit">
          Dupliquer
        </button>
      </form>
      <form method="POST">
        <Hidden csrf={csrf} action="delete" />
        <button class="button" type="submit">
          Supprimer définitivement
        </button>
      </form>
      <p>
        <a href={HOME}>Toutes mes collectes</a>
      </p>
    </Layout>
  )
})

// --- what the editor reads and writes

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * The member and their collection, for a request the editor sends: the session
 * comes in its cookie, and a change must carry the CSRF token in a header,
 * which a page of another site can neither read nor send.
 */
async function ownCollection(cxt: Context) {
  const token = memberTokenIn(cxt.request.headers.get("cookie"))
  const member = token === undefined ? undefined : await findSessionMember(cxt.db, token)
  const collection =
    member === undefined ? undefined : await findCollection(cxt.db, member.id, cxt.params.id)

  return token === undefined || collection === undefined ? undefined : { token, collection }
}

export async function collectionData(cxt: Context) {
  const own = await ownCollection(cxt)

  if (own === undefined) {
    return json({ error: "Collecte inconnue, ou session terminée." }, 404)
  }

  if (cxt.request.method === "GET") {
    return json(await documentOf(cxt.db, own.collection))
  }
  if (cxt.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }
  if (!csrfTokenMatches(own.token, cxt.request.headers.get("x-csrf-token"))) {
    return json({ error: "Session expirée : rouvrez la collecte depuis votre espace." }, 403)
  }

  const body = await cxt.request.text()
  if (body.length > MAXIMUM_DOCUMENT_BYTES) {
    return json({ error: "Le document est trop volumineux pour une collecte." }, 413)
  }

  const read = featureCollectionIn(
    await Promise.resolve(body)
      .then(JSON.parse)
      .catch(() => undefined),
  )
  if ("problem" in read) {
    return json({ error: read.problem }, 422)
  }

  await saveDocument(cxt.db, own.collection, read.collection)

  return json({ saved: true, features: read.collection.features.length })
}

/**
 * What the editor needs to know of the collection it opens: its name, whether
 * it may be saved, and the token to send with a change.
 */
export async function collectionSession(cxt: Context) {
  const own = await ownCollection(cxt)

  return own === undefined
    ? json({ error: "Collecte inconnue, ou session terminée." }, 404)
    : json({
        name: own.collection.name,
        editable: true,
        csrf: csrfTokenOf(own.token),
        back: pathOf(own.collection),
      })
}

export const collectionExport = membered(async ({ cxt, member }) => {
  const collection = await findCollection(cxt.db, member.id, cxt.params.id)

  return collection === undefined
    ? new Response("Collecte inconnue", { status: 404 })
    : new Response(csvOf(await documentOf(cxt.db, collection)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="collecte-${collection.id}.csv"`,
          "Cache-Control": "no-store",
        },
      })
})
