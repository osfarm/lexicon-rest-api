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
import { veiled } from "../preview/Preview"
import { communePurchases, type CommunePurchases } from "../phytosanitary/Purchases"
import { Reserved, Veil } from "../templates/components/Reserved"

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

// The same rows for a visitor without a key: the start of each text, no figure
function VeiledRows(props: { rows: [string, unknown][] }) {
  return (
    <table style={{ width: "100%" }}>
      <tbody>
        {props.rows.map(([label, value]) => (
          <tr>
            <td style={{ width: "40%" }}>
              <b>{e(label)}</b>
            </td>
            <td>
              <Veil value={veiled(value)} />
            </td>
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
  const purchases = await communePurchases(cxt.db, identifier)

  if (wantsJson) {
    return Response.json({ ...link, "phytosanitary-purchases": purchases ?? null })
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
            "Parcelles dont un propriétaire est une société connue de SIRENE",
            cxt.numberFormatter(link.cadastre["parcels-with-enterprise-owner"]),
          ],
          [
            "Établissements (toutes activités)",
            cxt.numberFormatter(link.establishments),
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
      {purchases ? <Purchases purchases={purchases} cxt={cxt} /> : ""}
      <p>
        <a href={`/links/communes/${e(link["insee-code"])}.json`}>JSON</a>
      </p>
    </Layout>
  )
}

const FUNCTIONS: Record<string, string> = {
  herbicide: "Herbicides",
  fungicide: "Fongicides, bactéricides",
  insecticide: "Insecticides, acaricides",
  other: "Autres (molluscicides, régulateurs de croissance…)",
}

// What the commune bought of plant protection products, year by year: purchases, not uses
function Purchases(props: { purchases: CommunePurchases; cxt: Context }) {
  const { purchases, cxt } = props
  const { farmland, latest } = purchases
  const kilograms = (quantity: number) => `${cxt.numberFormatter(quantity)} kg`

  return (
    <section class="purchases">
      <h2>Achats de produits phytosanitaires</h2>
      <p class="quiet">
        Quantités de substances actives achetées, estimées par le SDES à partir des
        déclarations des distributeurs (BNV-D). Ce sont des achats, pas des usages : une
        quantité est déclarée au code postal de l'acheteur, puis répartie entre les communes
        de ce code postal au prorata de leur surface agricole hors prairies. Le lieu et la
        date d'achat ne disent ni où ni quand le produit est appliqué.
      </p>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Année</th>
              <th>Substance active achetée</th>
              <th>Par hectare</th>
              <th>Produits</th>
              <th>Substances</th>
            </tr>
          </thead>
          <tbody>
            {purchases.years.map((year) => (
              <tr>
                <td>{year.year}</td>
                <td>
                  {year.quantity === undefined
                    ? "masqué par le secret statistique"
                    : kilograms(year.quantity) +
                      (year.masked ? " (hors achats masqués par le secret statistique)" : "")}
                </td>
                <td>
                  {year["per-hectare"] === undefined
                    ? "—"
                    : `${cxt.numberFormatter(year["per-hectare"])} kg/ha`}
                </td>
                <td>{cxt.numberFormatter(year.products)}</td>
                <td>{cxt.numberFormatter(year.substances)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {farmland && purchases.years.some((year) => year["per-hectare"] !== undefined) ? (
        <p class="quiet">
          Par hectare : rapporté aux {cxt.numberFormatter(farmland.hectares)} ha de surface
          agricole hors prairies déclarés à la PAC dans la commune en {farmland.campaign},
          quelle que soit l'année d'achat. La répartition de la source se faisant déjà au
          prorata de cette surface, les communes d'un même code postal ont des chiffres
          voisins.
        </p>
      ) : (
        ""
      )}
      {latest ? (
        <>
          <h3>En {latest.year}, par fonction</h3>
          <Rows
            rows={latest["by-function"].map((row): [string, unknown] => [
              FUNCTIONS[row.function] ?? row.function,
              kilograms(row.quantity),
            ])}
          />
          <h3>En {latest.year}, par classe de danger</h3>
          <Rows
            rows={latest["by-danger"].map((row): [string, unknown] => [
              row.danger,
              kilograms(row.quantity),
            ])}
          />
          <h3>En {latest.year}, les substances les plus achetées</h3>
          <Rows
            rows={latest["top-substances"].map((row): [string, unknown] => [
              row.substance,
              `${kilograms(row.quantity)} — ${(FUNCTIONS[row.function] ?? row.function).toLowerCase()}${
                row.danger ? ", " + row.danger : ""
              }`,
            ])}
          />
          <p>
            <a
              href={`/phytosanitary/purchases?commune=${e(purchases["insee-code"])}&year=${latest.year}`}
            >
              Tous les achats de {latest.year} par produit
            </a>
          </p>
        </>
      ) : (
        ""
      )}
    </section>
  )
}

async function enterprise(cxt: Context) {
  const { identifier, wantsJson } = identifierAndFormat(cxt, "siren")

  // A preview is a page: the record itself stays refused without a key
  if (cxt.preview && wantsJson) {
    return refusal(401, "This resource needs an API key")
  }

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

  const rows: [string, unknown][] = [
          ["SIREN", link.siren],
          ["Forme juridique", link["legal-form"]],
          ["Parcelles possédées", cxt.numberFormatter(link.cadastre.parcels)],
          [
            "Surface possédée (ha)",
            cxt.numberFormatter(Math.round(link.cadastre["area-m2"] / 10000)),
          ],
          ["Communes concernées", cxt.numberFormatter(link.cadastre.communes)],
          [
            "Établissements (toutes activités)",
            cxt.numberFormatter(link.establishments.count),
          ],
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
  ]

  if (cxt.preview) {
    // The SIREN is what the visitor typed: it is the only value shown whole
    return (
      <Layout title={link.siren} breadcrumbs={breadcrumbs(cxt)} t={cxt.t}>
        <Reserved t={cxt.t}>
          <VeiledRows rows={rows.filter(([label]) => label !== "SIREN")} />
        </Reserved>
      </Layout>
    )
  }

  return (
    <Layout title={`${link.name ?? link.siren}`} breadcrumbs={breadcrumbs(cxt)} t={cxt.t}>
      <Rows
        rows={rows}
      />
    </Layout>
  )
}

export const Links = API.new()
  .path("/links", index)
  .path("/links/communes/:insee", commune)
  // Companies are linked to the parcels they own: reserved to the holders of a key
  .restrictedTo(MEMBERS_SCOPE, { preview: true })
  .path("/links/enterprises/:siren", enterprise)
