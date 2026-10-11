import { Html } from "@elysiajs/html"
import type { HypermediaType } from "../../Hypermedia"
import { Layout } from "../../templates/layouts/Layout"
import type { Context } from "../../types/Context"
import { SCHOOLS_CAVEAT } from "../../territory/Territory"
import {
  choicesOf,
  findSchools,
  placeOf,
  ROUTES,
  SCHOOLS_LISTED,
  type Training,
  type TrainingFilters,
  type TrainingSchool,
} from "../../territory/Trainings"

// Find where a diploma of agricultural education is prepared: by place, diploma,
// speciality and route. The page and its JSON answer the same question.

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const ROUTE_NAMES: Record<string, string> = {
  school: "Voie scolaire",
  apprenticeship: "Apprentissage",
  continuing: "Formation continue",
  higher_education: "Enseignement supérieur",
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

function filtersOf(query: Record<string, unknown>): TrainingFilters {
  return {
    place: text(query.place) || undefined,
    school: text(query.school) || undefined,
    diploma: text(query.diploma) || undefined,
    speciality: text(query.speciality) || undefined,
    route: ROUTES.includes(text(query.route)) ? text(query.route) : undefined,
    boarding: text(query.boarding) === "1" || undefined,
    q: text(query.q) || undefined,
  }
}

function Select(props: {
  name: string
  label: string
  chosen?: string
  options: [string, string][]
}) {
  return (
    <label style={{ display: "inline-block", marginRight: "10px", marginBottom: "8px" }}>
      {e(props.label)}
      <br />
      <select class="field" name={props.name}>
        <option value="">Tous</option>
        {props.options.map(([value, label]) => (
          <option value={e(value)} selected={value === props.chosen}>
            {e(label)}
          </option>
        ))}
      </select>
    </label>
  )
}

// The trainings of a school, one line per diploma and name, with the routes it is open by
function Trainings(props: { trainings: Training[] }) {
  const lines = new Map<string, { training: Training; routes: string[] }>()

  for (const training of props.trainings) {
    const key = training.diploma + "|" + training.name
    const line = lines.get(key) ?? { training, routes: [] }

    line.routes.push(ROUTE_NAMES[training.route] ?? training.route)
    lines.set(key, line)
  }

  return (
    <ul>
      {[...lines.values()].map(({ training, routes }) => (
        <li>
          {e(training.name)}
          {training.speciality ? ` — ${e(training.speciality)}` : ""}
          <span class="quiet"> ({e(routes.join(", ").toLowerCase())})</span>
        </li>
      ))}
    </ul>
  )
}

function School(props: { school: TrainingSchool; open: boolean }) {
  const { school } = props
  const where = [school.address, [school["postal-code"], school.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ")
  const website =
    school.website && !/^https?:\/\//.test(school.website) ? "https://" + school.website : school.website

  return (
    <article class="training-school">
      <h3>
        {e(school.name)}
        {school.distance !== undefined ? (
          <span class="quiet"> — à environ {school.distance} km</span>
        ) : (
          ""
        )}
      </h3>
      <p>
        {e(
          [
            school.nature,
            school.sector === "public" ? "public" : school.sector ? "privé" : undefined,
            school.affiliation,
            school.boarding ? "internat" : undefined,
            school["half-board"] ? "demi-pension" : undefined,
          ]
            .filter(Boolean)
            .join(", "),
        )}
        <br />
        {e(where)}
        {school["insee-code"] ? (
          <>
            {" "}
            (<a href={`/links/communes/${e(school["insee-code"])}`}>fiche de la commune</a>)
          </>
        ) : (
          ""
        )}
        <br />
        {school.phone ? <>{e(school.phone)} </> : ""}
        {school.email ? <a href={`mailto:${e(school.email)}`}>{e(school.email)}</a> : ""}{" "}
        {website ? <a href={e(website)}>site internet</a> : ""}
      </p>
      <details open={props.open}>
        <summary>
          {school.trainings.length} {school.trainings.length > 1 ? "formations" : "formation"}
        </summary>
        <Trainings trainings={school.trainings} />
      </details>
    </article>
  )
}

export async function TrainingsController(cxt: Context, breadcrumbs: HypermediaType["Link"][]) {
  const filters = filtersOf(cxt.query as Record<string, unknown>)
  const [choices, place] = await Promise.all([
    choicesOf(cxt.db),
    filters.place ? placeOf(cxt.db, filters.place) : undefined,
  ])
  const asked = Object.values(filters).some((value) => value !== undefined)
  const schools = asked ? await findSchools(cxt.db, filters, place) : undefined

  if (cxt.output === "json") {
    return choices === undefined
      ? Response.json(
          { error: { status: 404, message: "Agricultural schools are not in service" } },
          { status: 404 },
        )
      : Response.json({
          filters,
          place: place ?? null,
          schools: schools ?? [],
          diplomas: choices.diplomas,
          specialities: choices.specialities,
          routes: ROUTES,
          caveat: SCHOOLS_CAVEAT,
        })
  }

  return (
    <Layout title="Trouver une formation agricole" breadcrumbs={breadcrumbs} t={cxt.t}>
      {choices === undefined ? (
        <p>Les établissements de l'enseignement agricole ne sont pas en service.</p>
      ) : (
        <>
          <p>
            Les établissements de l'enseignement agricole et ce qu'ils préparent, les plus proches
            d'abord quand un lieu est donné.
          </p>
          <form method="get" action="/tools/trainings">
            <label style={{ display: "inline-block", marginRight: "10px", marginBottom: "8px" }}>
              Commune, code postal ou code INSEE
              <br />
              <input class="field" name="place" value={e(filters.place ?? "")} style={{ width: "240px" }} />
            </label>
            <Select
              name="diploma"
              label="Diplôme"
              chosen={filters.diploma}
              options={choices.diplomas.map((diploma) => [diploma, diploma])}
            />
            <Select
              name="speciality"
              label="Spécialité"
              chosen={filters.speciality}
              options={choices.specialities.map((speciality) => [speciality, speciality])}
            />
            <Select
              name="route"
              label="Voie"
              chosen={filters.route}
              options={ROUTES.map((route) => [route, ROUTE_NAMES[route]])}
            />
            <label style={{ display: "inline-block", marginRight: "10px", marginBottom: "8px" }}>
              Intitulé contient
              <br />
              <input class="field" name="q" value={e(filters.q ?? "")} style={{ width: "180px" }} />
            </label>
            <label style={{ display: "inline-block", marginRight: "10px", marginBottom: "8px" }}>
              <input type="checkbox" name="boarding" value="1" checked={filters.boarding === true} />{" "}
              Avec internat
            </label>
            <button class="button primary" type="submit">
              Chercher
            </button>
          </form>
          {filters.place && !place ? (
            <p>
              <b>Lieu inconnu : « {e(filters.place)} ».</b> Les établissements sont classés par nom.
            </p>
          ) : place ? (
            <p class="quiet">
              Distances depuis {e(place.name)} ({e(place["insee-code"])}), de centre de commune à
              centre de commune.
            </p>
          ) : (
            ""
          )}
          {schools === undefined ? (
            ""
          ) : schools.length === 0 ? (
            <p>Aucun établissement ne prépare cette formation.</p>
          ) : (
            <>
              {schools.length === SCHOOLS_LISTED ? (
                <p class="quiet">Les {SCHOOLS_LISTED} premiers établissements.</p>
              ) : (
                ""
              )}
              {schools.map((school) => (
                <School school={school} open={schools.length <= 3 || Boolean(filters.diploma || filters.speciality || filters.q)} />
              ))}
            </>
          )}
          <p class="quiet">
            Un établissement est placé dans sa commune, pas à son adresse. Source : RefEA, portail
            de données de l'enseignement agricole (ministère de l'Agriculture).
          </p>
        </>
      )}
    </Layout>
  )
}
