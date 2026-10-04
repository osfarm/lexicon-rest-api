import { Html } from "@elysiajs/html"
import { API } from "../API"
import { MEMBERS_SCOPE } from "../access/Plan"
import { Hypermedia } from "../Hypermedia"
import {
  communeLinkOf,
  enterpriseLinkOf,
  isInseeCode,
  isSiren,
  readCommuneLink,
  readCapYears,
  readEnterpriseLink,
} from "../links/Links"
import { Layout } from "../templates/layouts/Layout"
import type { Context } from "../types/Context"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const refusal = (status: number, message: string) =>
  Response.json({ error: { status, message } }, { status })

const breadcrumbs = (cxt: Context) => [
  Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: "Fiches", method: "GET", href: "/links" }),
]

// The format is part of the last segment: /links/communes/17387.json
function identifierAndFormat(cxt: Context, name: string) {
  const [identifier, format] = cxt.params[name].split(".")

  return { identifier, wantsJson: format === "json" }
}

function Rows(props: { rows: [string, unknown][] }) {
  return (
    <table style={{ width: "100%" }}>
      <tbody>
        {props.rows.map(([label, value]) => (
          <tr>
            <td style={{ width: "40%" }}>
              <b>{e(label)}</b>
            </td>
            <td>{e(value ?? "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function index(cxt: Context) {
  return (
    <Layout
      title="Fiches"
      breadcrumbs={[
        Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
      ]}
      t={cxt.t}
    >
      <p>
        Une fiche réunit, pour une commune ou une entreprise, ce que les différents jeux
        de données savent d'elle. Elle est calculée à la publication des données, pas à la
        demande.
      </p>
      <ul>
        <li>
          <code>/links/communes/&lt;code INSEE&gt;</code> — par exemple{" "}
          <a href="/links/communes/17387">/links/communes/17387</a>
        </li>
        <li>
          <code>/links/enterprises/&lt;SIREN&gt;</code> — personnes morales uniquement,
          réservé aux adhérents (clé d'API)
        </li>
      </ul>
      <p>
        Ajouter <code>.json</code> à l'adresse pour obtenir la fiche en JSON.
      </p>
    </Layout>
  )
}

async function commune(cxt: Context) {
  const { identifier, wantsJson } = identifierAndFormat(cxt, "insee")

  if (!isInseeCode(identifier)) {
    return refusal(400, "An INSEE code has five characters, such as 17387 or 2A004")
  }

  const row = await readCommuneLink(cxt.db, identifier)

  if (row === undefined) {
    return refusal(404, "Commune records are not in service")
  }
  if (row === null) {
    return refusal(404, `No commune ${identifier}`)
  }

  const link = communeLinkOf(row)

  if (wantsJson) {
    return Response.json(link)
  }

  return (
    <Layout
      title={`${link.name} (${link["insee-code"]})`}
      breadcrumbs={breadcrumbs(cxt)}
      t={cxt.t}
    >
      <Rows
        rows={[
          ["Codes postaux", link["postal-codes"].join(", ")],
          ["Département", link["department-code"]],
          ["Région", link["region-code"]],
          ["Parcelles cadastrales", cxt.numberFormatter(link.cadastre.parcels)],
          [
            "Surface cadastrale (ha)",
            cxt.numberFormatter(Math.round(link.cadastre["area-m2"] / 10000)),
          ],
          [
            "Parcelles dont un propriétaire est une personne morale agricole",
            cxt.numberFormatter(link.cadastre["parcels-with-agricultural-owner"]),
          ],
          [
            "Établissements agricoles",
            cxt.numberFormatter(link["agricultural-enterprises"]),
          ],
          [
            "Chefs d'exploitation (MSA)",
            link.msa === null
              ? null
              : `${link.msa["farm-chiefs"] ?? "—"} en ${link.msa.year}`,
          ],
          ["Station météo la plus proche", link["weather-station"]],
        ]}
      />
      <p>
        <a href={`/links/communes/${e(link["insee-code"])}.json`}>JSON</a>
      </p>
    </Layout>
  )
}

async function enterprise(cxt: Context) {
  const { identifier, wantsJson } = identifierAndFormat(cxt, "siren")

  if (!isSiren(identifier)) {
    return refusal(400, "A SIREN has nine digits")
  }

  const row = await readEnterpriseLink(cxt.db, identifier)

  if (row === undefined) {
    return refusal(404, "Company records are not in service")
  }
  if (row === null) {
    return refusal(404, `No legal entity ${identifier} in the records`)
  }

  const link = enterpriseLinkOf(row, await readCapYears(cxt.db, identifier))

  if (wantsJson) {
    return Response.json(link)
  }

  return (
    <Layout title={`${link.name ?? link.siren}`} breadcrumbs={breadcrumbs(cxt)} t={cxt.t}>
      <Rows
        rows={[
          ["SIREN", link.siren],
          ["Forme juridique", link["legal-form"]],
          ["Parcelles possédées", cxt.numberFormatter(link.cadastre.parcels)],
          [
            "Surface possédée (ha)",
            cxt.numberFormatter(Math.round(link.cadastre["area-m2"] / 10000)),
          ],
          ["Communes concernées", cxt.numberFormatter(link.cadastre.communes)],
          ["Établissements agricoles", cxt.numberFormatter(link.establishments.count)],
          ["Activité principale", link.establishments["main-activity-code"]],
          ...(link["cap-by-year"].length > 0
            ? link["cap-by-year"].map((year): [string, unknown] => [
                `Aides PAC ${year.year}`,
                `${cxt.numberFormatter(year.total)} €`,
              ])
            : [
                [
                  "Aides PAC",
                  link.cap === null
                    ? null
                    : `${cxt.numberFormatter(link.cap.total)} € en ${link.cap.year}`,
                ] as [string, unknown],
              ]),
        ]}
      />
    </Layout>
  )
}

export const Links = API.new()
  .path("/links", index)
  .path("/links/communes/:insee", commune)
  // Companies are linked to the parcels they own: reserved to the holders of a key
  .restrictedTo(MEMBERS_SCOPE)
  .path("/links/enterprises/:siren", enterprise)
