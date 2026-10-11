import { Html } from "@elysiajs/html"
import type {
  Canteens,
  Hve,
  HveFarm,
  Organic,
  QualitySigns,
  QualityZone,
  Schools,
  Territory,
} from "../../territory/Territory"

// The farming and food of a commune, as the page of a commune and the parcel
// tool show it. Each part says, under its figures, what they do not say.

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

type Format = (value: number) => string

const FAMILIES: Record<string, string> = {
  wine: "Vins",
  spirits: "Spiritueux et autres boissons",
  cheese: "Fromages",
  meat: "Viandes et charcuteries",
  fruits_and_vegetables: "Fruits, légumes et céréales",
  seafood: "Produits de la mer",
  other: "Autres produits",
}
const SIGNS: Record<string, string> = { AOC: "AOC/AOP", IGP: "IGP", IG: "IG" }
const PRODUCTS_SHOWN = 6

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one)

function Signs(props: { signs: QualitySigns; zones?: QualityZone[] }) {
  const { signs, zones } = props
  const families = [...new Set(signs.areas.map((area) => area.family))]
  const counted = Object.entries(signs.count)
    .map(([sign, count]) => `${count} ${SIGNS[sign] ?? sign}`)
    .join(", ")

  return (
    <section class="territory-part">
      <h3>Signes de qualité et d'origine</h3>
      {signs.areas.length === 0 ? (
        <p class="quiet">Aucune aire d'AOC/AOP, d'IGP ou d'IG ne couvre cette commune.</p>
      ) : (
        <>
          <p>
            La commune est dans {signs.areas.length}{" "}
            {plural(signs.areas.length, "aire géographique", "aires géographiques")} : {e(counted)}.
          </p>
          {zones && zones.length > 0 ? (
            <p>
              <b>Ce point est dans la zone délimitée</b> de{" "}
              {e(
                zones
                  .map((zone) =>
                    zone.denomination ? `${zone.appellation} (${zone.denomination})` : zone.appellation,
                  )
                  .join(", "),
              )}
              .
            </p>
          ) : zones ? (
            <p class="quiet">
              Ce point n'est dans aucune zone délimitée d'AOC viticole publiée par l'INAO.
            </p>
          ) : (
            ""
          )}
          {families.map((family) => {
            const areas = signs.areas.filter((area) => area.family === family)

            return (
              <details class="territory-family" open={families.length <= 2 || areas.length <= 4}>
                <summary>
                  {e(FAMILIES[family] ?? family)} ({areas.length})
                </summary>
                <ul>
                  {areas.map((area) => (
                    <li>
                      <b>{e(area.name)}</b> — {e(SIGNS[area.sign] ?? area.sign)}
                      {area.partial ? (
                        <span class="quiet">
                          {" "}
                          sur une partie de la commune (ancienne
                          {plural(area["former-communes"]?.length ?? 1, " commune ", "s communes ")}
                          {e((area["former-communes"] ?? []).join(", "))})
                        </span>
                      ) : (
                        ""
                      )}
                      {area.products.length > 1 ||
                      (area.products.length === 1 && area.products[0] !== area.name) ? (
                        <span class="quiet">
                          {" : "}
                          {e(area.products.slice(0, PRODUCTS_SHOWN).join(", "))}
                          {area.products.length > PRODUCTS_SHOWN
                            ? ` et ${area.products.length - PRODUCTS_SHOWN} autres produits`
                            : ""}
                        </span>
                      ) : (
                        ""
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </>
      )}
      <p class="quiet">
        Information, et non délimitation officielle : seul le cahier des charges d'un produit dit
        où il peut être élaboré. Le Label Rouge et la STG n'ont pas de territoire. Source : INAO,
        listes de communes d'octobre 2025.
      </p>
    </section>
  )
}

const hectares = (value: number | undefined, format: Format) =>
  value === undefined ? "—" : `${format(value)} ha`

function OrganicPart(props: { organic: Organic; format: Format }) {
  const { organic, format } = props
  const operators = organic.operators
  const total =
    operators.producers + operators.processors + operators.distributors + operators.importers
  const latest = organic.years.find((year) => year.year === organic.year)

  return (
    <section class="territory-part">
      <h3>Agriculture biologique</h3>
      {total === 0 && organic.years.length === 0 ? (
        <p class="quiet">
          Aucun opérateur bio n'a son siège dans cette commune en {organic.year}.
        </p>
      ) : (
        <>
          <p>
            En {organic.year} : {format(operators.producers)}{" "}
            {plural(operators.producers, "producteur", "producteurs")}, {format(operators.processors)}{" "}
            {plural(operators.processors, "transformateur", "transformateurs")},{" "}
            {format(operators.distributors)}{" "}
            {plural(operators.distributors, "distributeur", "distributeurs")}
            {operators.importers > 0
              ? `, ${format(operators.importers)} ${plural(operators.importers, "importateur", "importateurs")}`
              : ""}
            .
            {organic["main-productions"].length > 0 ? (
              <span class="quiet">
                {" "}
                Productions principales :{" "}
                {e(
                  organic["main-productions"]
                    .map((row) => `${row.production.toLowerCase()} (${row.operators})`)
                    .join(", "),
                )}
                .
              </span>
            ) : (
              ""
            )}
          </p>
          {organic.years.length > 0 ? (
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Année</th>
                    <th>Exploitations</th>
                    <th>Surface engagée en bio</th>
                    <th>dont en conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {organic.years.map((year) => (
                    <tr>
                      <td>{year.year}</td>
                      <td>{format(year.farms)}</td>
                      <td>
                        {year.masked ? "secret statistique" : hectares(year.area, format)}
                      </td>
                      <td>{year.masked ? "—" : hectares(year["conversion-area"], format)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            ""
          )}
          {organic.livestock.length > 0 ? (
            <p>
              Élevages en {organic.year} :{" "}
              {e(
                organic.livestock
                  .map(
                    (herd) =>
                      `${herd.production.toLowerCase()} (${herd.farms} ${plural(herd.farms, "exploitation", "exploitations")}${
                        herd.heads !== undefined ? `, ${format(herd.heads)} têtes ou ruches` : ""
                      })`,
                  )
                  .join(", "),
              )}
              .
            </p>
          ) : (
            ""
          )}
          {latest?.masked ? (
            <p class="quiet">
              Moins de trois exploitations : la surface de la commune est couverte par le secret
              statistique.
            </p>
          ) : (
            ""
          )}
        </>
      )}
      {organic.epci ? (
        <p>
          <b>{e(organic.epci.name)}</b> en {organic.epci.year} :{" "}
          {format(organic.epci.farms)} {plural(organic.epci.farms, "exploitation", "exploitations")}
          {organic.epci.area !== undefined
            ? `, ${format(organic.epci.area)} ha engagés en bio`
            : ", surface sous secret statistique"}
          {organic.epci["conversion-area"] !== undefined
            ? ` dont ${format(organic.epci["conversion-area"])} ha en conversion`
            : ""}
          .
          {organic.epci.livestock.some((herd) => herd.heads !== undefined) ? (
            <span class="quiet">
              {" "}
              {e(
                organic.epci.livestock
                  .filter((herd) => herd.heads !== undefined)
                  .map((herd) => `${herd.production.toLowerCase()} : ${format(herd.heads as number)}`)
                  .join(", "),
              )}
              .
            </span>
          ) : (
            ""
          )}
        </p>
      ) : (
        ""
      )}
      <p class="quiet">
        Toutes les parcelles d'une exploitation sont comptées dans la commune de son siège, où
        qu'elles se trouvent. Les surfaces et cheptels de moins de trois exploitations sont
        masqués à la commune ; l'intercommunalité donne l'ordre de grandeur. Source : Agence Bio.
      </p>
    </section>
  )
}

function Farm(props: { farm: HveFarm }) {
  const { farm } = props
  const activities = [farm["plant-activity"], farm["animal-activity"]].filter(Boolean).join(", ")

  return (
    <li>
      {farm.website ? <a href={e(farm.website)}>{e(farm.name)}</a> : e(farm.name)}
      {activities ? ` — ${e(activities.toLowerCase())}` : ""}
      {farm["direct-sales"] ? ", vente directe" : ""}
      {farm["certified-on"] ? (
        <span class="quiet"> certifiée depuis le {e(frenchDate(farm["certified-on"]))}</span>
      ) : (
        ""
      )}
    </li>
  )
}

const frenchDate = (iso: string) => iso.split("-").reverse().join("/")

function HvePart(props: { hve: Hve; owners?: HveFarm[]; format: Format }) {
  const { hve, owners, format } = props

  return (
    <section class="territory-part">
      <h3>Haute Valeur Environnementale</h3>
      <p>
        {hve.farms === 0
          ? "Aucune exploitation de l'annuaire HVE n'a son siège dans cette commune."
          : `Au moins ${format(hve.farms)} ${plural(hve.farms, "exploitation certifiée HVE a son", "exploitations certifiées HVE ont leur")} siège dans cette commune.`}
      </p>
      {owners && owners.length > 0 ? (
        <p>
          <b>Parmi les propriétaires de cette parcelle</b>, certifié HVE :{" "}
          {e(owners.map((farm) => farm.name).join(", "))}.
        </p>
      ) : (
        ""
      )}
      {hve.list && hve.list.length > 0 ? (
        <details>
          <summary>Les exploitations de l'annuaire</summary>
          <ul>
            {hve.list.map((farm) => (
              <Farm farm={farm} />
            ))}
          </ul>
        </details>
      ) : hve.farms > 0 && !hve.list ? (
        <p class="quiet">
          Le nom des exploitations est réservé aux adhérents (clé d'API).
        </p>
      ) : (
        ""
      )}
      <p class="quiet">
        Seules figurent les exploitations qui ont accepté d'être dans l'annuaire : c'est un
        minimum, pas un compte. Source : ministère de l'Agriculture.
      </p>
    </section>
  )
}

const share = (value: number | undefined, format: Format) =>
  value === undefined ? "—" : `${format(value)} %`

function CanteensPart(props: { canteens: Canteens; format: Format }) {
  const { canteens, format } = props

  return (
    <section class="territory-part">
      <h3>Restauration collective</h3>
      <p>
        {canteens.registered === 0
          ? "Aucune cantine de la commune n'est inscrite au registre national."
          : `${format(canteens.registered)} ${plural(canteens.registered, "cantine inscrite", "cantines inscrites")} au registre national${
              canteens["daily-meals"] ? `, ${format(canteens["daily-meals"])} repas par jour` : ""
            }.`}
      </p>
      {canteens.years.length > 0 ? (
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Année</th>
                <th>Cantines déclarantes</th>
                <th>Part de bio, pondérée par les repas</th>
                <th>Part de bio médiane</th>
                <th>Autres signes de qualité, pondérée</th>
                <th>
                  Cantines à {canteens.targets.organic} % de bio et {canteens.targets.quality} % de
                  qualité
                </th>
              </tr>
            </thead>
            <tbody>
              {canteens.years.map((year) => (
                <tr>
                  <td>{year.year}</td>
                  <td>
                    {format(year.declarations)}
                    {year["central-kitchens"] > 0
                      ? ` dont ${year["central-kitchens"]} ${plural(year["central-kitchens"], "cuisine centrale", "cuisines centrales")}`
                      : ""}
                  </td>
                  <td>{share(year["weighted-organic-share"], format)}</td>
                  <td>{share(year["median-organic-share"], format)}</td>
                  <td>{share(year["weighted-quality-share"], format)}</td>
                  <td>{format(year["meeting-targets"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : canteens.registered > 0 ? (
        <p class="quiet">Aucune n'a télédéclaré ses achats.</p>
      ) : (
        ""
      )}
      {canteens.latest ? (
        <details>
          <summary>Les déclarations de {canteens.latest.year}</summary>
          <ul>
            {canteens.latest.declarations.map((declaration) => (
              <li>
                {e(declaration.name)}
                <span class="quiet">
                  {declaration.sectors.length > 0 ? ` (${e(declaration.sectors.join(", "))})` : ""}
                  {declaration.central ? ", cuisine centrale déclarant pour ses restaurants" : ""}
                </span>
                {" — "}
                {share(declaration["organic-share"], format)} de bio,{" "}
                {share(declaration["quality-share"], format)} d'autres signes de qualité
                {declaration["meets-targets"] ? ", objectifs atteints" : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        ""
      )}
      <p class="quiet">
        Parts des achats alimentaires, en valeur. La loi EGalim demande {canteens.targets.quality} %
        de produits durables et de qualité, dont {canteens.targets.organic} % de bio. Seules les
        cantines qui ont télédéclaré figurent ici : une commune sans déclaration n'est pas une
        commune sans cantine, et une cuisine centrale déclare là où elle cuisine. Source : ma
        cantine.
      </p>
    </section>
  )
}

function SchoolsPart(props: { schools: Schools; inseeCode: string }) {
  const { schools, inseeCode } = props

  return (
    <section class="territory-part">
      <h3>Enseignement agricole</h3>
      {schools.schools.length === 0 ? (
        <p class="quiet">Aucun établissement connu.</p>
      ) : (
        <>
          <p>
            {schools["in-commune"]
              ? "Dans la commune :"
              : "Aucun établissement dans la commune. Les plus proches :"}
          </p>
          <ul>
            {schools.schools.map((school) => (
              <li>
                <a href={`/tools/trainings?school=${e(school.id)}`}>{e(school.name)}</a>
                {school.nature ? ` (${e(school.nature)})` : ""}
                {school.distance !== undefined
                  ? `, ${e(school.city)} à environ ${school.distance} km`
                  : ""}
                {" — "}
                {school.trainings} {plural(school.trainings, "formation", "formations")}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        <a href={`/tools/trainings?place=${e(inseeCode)}`}>Trouver une formation agricole</a>
      </p>
      <p class="quiet">
        Un établissement est placé dans sa commune, pas à son adresse. Source : RefEA, ministère de
        l'Agriculture.
      </p>
    </section>
  )
}

export function TerritorySections(props: {
  territory: Territory
  format: Format
  // The zones delimited for wines under AOC that hold the point asked for
  zones?: QualityZone[]
  // Owners of the parcel that are in the HVE directory
  owners?: HveFarm[]
}) {
  const { territory, format } = props

  return (
    <div class="territory">
      {territory["quality-signs"] ? (
        <Signs signs={territory["quality-signs"]} zones={props.zones} />
      ) : (
        ""
      )}
      {territory.organic ? <OrganicPart organic={territory.organic} format={format} /> : ""}
      {territory.hve ? <HvePart hve={territory.hve} owners={props.owners} format={format} /> : ""}
      {territory.canteens ? <CanteensPart canteens={territory.canteens} format={format} /> : ""}
      {territory.schools ? (
        <SchoolsPart schools={territory.schools} inseeCode={territory["insee-code"]} />
      ) : (
        ""
      )}
    </div>
  )
}
