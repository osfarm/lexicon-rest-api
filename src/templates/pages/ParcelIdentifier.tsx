import { Html } from "@elysiajs/html"
import type { Translator } from "../../Translator"
import { Layout } from "../layouts/Layout"
import { type FormDefinition } from "../components/Form"
import { match, type Result } from "shulk"
import { Error } from "../components/Error"
import type { Hypermedia, HypermediaType } from "../../Hypermedia"
import type { Coordinates } from "../../types/Coordinates"
import type { MultiPolygon } from "../../types/Geometry"
import { PlacePicker } from "../components/PlacePicker"
import { Chart } from "../components/Chart"
import type { Context } from "../../types/Context"
import { Table } from "../../Database"

export interface TableSection {
  label: string
  columns: Record<string, string>
  rows: Record<string, HypermediaType["any"] | undefined>[]
}

export interface ParcelIdentifierOkPage {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: FormDefinition
  information?: Record<string, Hypermedia>
  cadastre?: Record<string, Hypermedia>
  price?: Record<string, Hypermedia>
  cap?: Record<string, Hypermedia>
  // What was declared at the point, campaign after campaign, oldest first
  rotation?: { campaign: number; crop: string; code: string; current: boolean }[]
  // The point that was asked for
  point?: Coordinates
  soil?: Record<string, Hypermedia>
  links?: Record<string, HypermediaType["Link"]>
  transactions?: TableSection
  owners?: TableSection
  "natural-zones"?: TableSection
  "protected-water-zones"?: TableSection
  "area-items"?: TableSection
  "historical-yields"?: {
    production: HypermediaType["Text"]
    unit: HypermediaType["Text"]
    legend: {}
    values: {}
  }
  "agricultural-enterprises"?: TableSection
  "msa-populations"?: TableSection
  "last-year-weather-reports"?: {
    station: HypermediaType["Link"]
    distance?: HypermediaType["Number"]
    until?: HypermediaType["Date"]
    legend: {}
    values: {}
  }
  geolocation?: {
    coordinates: Coordinates
    marker?: import("../../types/Geometry").Point
    shape: MultiPolygon
  }
}

interface Props {
  context: Context
  page: Result<Error, ParcelIdentifierOkPage>
}

const DEFAULT_LATITUDE = 45.8295169339847
const DEFAULT_LONGITUDE = -0.786978473820221
const EXAMPLE = `?latitude=${DEFAULT_LATITUDE}&longitude=${DEFAULT_LONGITUDE}`

// Reports older than this are said to be old
const STALE_AFTER_IN_MS = 45 * 24 * 3600 * 1000

type Sections = Record<string, Hypermedia> | undefined

const text = (section: Sections, key: string): string | undefined => {
  const item = section?.[key] as { value?: unknown } | undefined

  return item?.value === undefined ? undefined : String(item.value)
}

export function ParcelIdentifier(props: Props) {
  const { page, context } = props

  const { t, numberFormatter } = context

  return match(page).case({
    Err: ({ val: error }) => <Error error={error} />,
    Ok: ({ val }) => (
      <Layout title={val.title} breadcrumbs={val.breadcrumbs} t={t}>
        <PlacePicker
          t={t}
          center={{ latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE }}
          point={val.point}
          shape={val.geolocation?.shape}
        />
        {val.point === undefined ? (
          <p class="place-invite">
            {t("tools_parcel_empty")} <a href={EXAMPLE}>{t("tools_parcel_example")}</a>
          </p>
        ) : (
          renderRecord(val, context)
        )}
      </Layout>
    ),
  })
}

// Everything the datasets know of the point, from the parcel outwards: the crop,
// the place, the ground, the weather, then the farms of the commune
function renderRecord(val: ParcelIdentifierOkPage, context: Context) {
  const { t, numberFormatter } = context
  const zones = [val["natural-zones"], val["protected-water-zones"], val["area-items"]]
  const knowsNothing =
    !val.cadastre && !val.information && !val.rotation && !val.soil

  if (knowsNothing) {
    return (
      <div class="card info">
        <div class="content">
          <p>{t("tools_parcel_nothing")}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {renderSummary(val, context)}

      <section class="record" id="culture">
        <h2 class="dot family-crops">{t("tools_parcel_section_crop")}</h2>
        {val.rotation ? (
          <ol class="rotation">
            {val.rotation.map((crop) => (
              <li class={crop.current ? "current" : undefined}>
                <span class="campaign">{crop.campaign}</span>
                <span class="crop">{Html.escapeHtml(crop.crop)}</span>
                {crop.code && crop.code !== crop.crop ? (
                  <span class="code">{Html.escapeHtml(crop.code)}</span>
                ) : (
                  ""
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p class="quiet">{t("tools_parcel_rotation_none")}</p>
        )}
        {val["historical-yields"] !== undefined && (
          <figure class="record-chart">
            <figcaption>
              {t("tools_historical_yields")} : {val["historical-yields"].production.value} (
              {val["historical-yields"].unit.value})
            </figcaption>
            <Chart
              legend={val["historical-yields"].legend}
              values={val["historical-yields"].values}
              height={240}
              plain
            />
          </figure>
        )}
        {/* The crops are in the rotation above; the reference name of the production is for programs */}
        {renderDetails(without(val.cap, /^(culture|production$)/), numberFormatter)}
      </section>

      <section class="record" id="lieu">
        <h2 class="dot family-places">{t("tools_parcel_section_place")}</h2>
        <div class="record-columns">
          <div>
            <h3>{t("tools_parcel_identifier_cadastre")}</h3>
            {val.cadastre ? (
              renderDetails(val.cadastre, numberFormatter)
            ) : (
              <p class="quiet">{t("tools_parcel_no_cadastre")}</p>
            )}
          </div>
          <div>
            <h3>{t("tools_parcel_commune")}</h3>
            {renderDetails(val.information, numberFormatter)}
            {val.links ? (
              <p>
                {Object.values(val.links).map((link) => (
                  <a href={link.href}>{link.value}</a>
                ))}
              </p>
            ) : (
              ""
            )}
          </div>
        </div>
        {val.transactions
          ? renderTableSection(val.transactions, context, t("tools_no_transaction"))
          : ""}
        {renderTableSection(val.owners, context)}
      </section>

      <section class="record" id="sol">
        <h2 class="dot family-environment">{t("tools_parcel_section_environment")}</h2>
        {val.soil ? renderDetails(val.soil, numberFormatter) : ""}
        {zones.some((zone) => zone !== undefined) ? (
          zones.map((zone) => renderTableSection(zone, context))
        ) : (
          <p class="quiet">{t("tools_parcel_no_zone")}</p>
        )}
      </section>

      {val["last-year-weather-reports"] !== undefined &&
        renderWeather(val["last-year-weather-reports"], context)}

      {(val["agricultural-enterprises"] || val["msa-populations"]) && (
        <section class="record" id="exploitations">
          <h2 class="dot family-farms">{t("tools_parcel_section_farms")}</h2>
          {renderEnterprises(val["agricultural-enterprises"], context)}
          {renderTableSection(val["msa-populations"], context)}
        </section>
      )}

      <p class="record-formats">
        <a
          class="button small"
          href={`/tools/parcel-identifier.json?latitude=${val.point?.latitude}&longitude=${val.point?.longitude}`}
        >
          {t("tools_parcel_json")}
        </a>
      </p>
    </>
  )
}

// The parcel in one line, as someone would say it: its name in the cadastre,
// where it is, how large, what grows there
function renderSummary(val: ParcelIdentifierOkPage, context: Context) {
  const { t, numberFormatter } = context
  const section = text(val.cadastre, "section")
  const number = text(val.cadastre, "number")
  const city = text(val.information, "city")
  const squareMeters = (val.cadastre?.area as { value?: number } | undefined)?.value
  const current = val.rotation?.find((crop) => crop.current)
  const depth = val.soil?.depth as { value?: number; unit?: string } | undefined

  const name =
    section && number
      ? `${t("tools_parcel_parcel")} ${section} ${number}`
      : t("tools_parcel_no_cadastre")
  const facts = [
    squareMeters !== undefined
      ? `${numberFormatter(Math.round(squareMeters / 100) / 100)} ha`
      : undefined,
    current ? `${current.crop.toLocaleLowerCase(context.language)} ${t("tools_parcel_in")} ${current.campaign}` : undefined,
    depth?.value !== undefined
      ? `${t("tools_parcel_soil_of")} ${numberFormatter(depth.value)} ${depth.unit ?? ""}`.trim()
      : undefined,
  ].filter((fact): fact is string => fact !== undefined)

  return (
    <header class="parcel-summary">
      <h2>
        {Html.escapeHtml(name)}
        {city ? <span class="where"> {Html.escapeHtml(city)}</span> : ""}
      </h2>
      {facts.length > 0 ? <p class="facts">{Html.escapeHtml(facts.join(", "))}</p> : ""}
      <nav class="chips" aria-label={t("tools_parcel_contents")}>
        <a class="chip family-crops" href="#culture">
          {t("tools_parcel_section_crop")}
        </a>
        <a class="chip family-places" href="#lieu">
          {t("tools_parcel_section_place")}
        </a>
        <a class="chip family-environment" href="#sol">
          {t("tools_parcel_section_environment")}
        </a>
        {val["last-year-weather-reports"] ? (
          <a class="chip family-environment" href="#meteo">
            {t("tools_parcel_section_weather")}
          </a>
        ) : (
          ""
        )}
        {val["agricultural-enterprises"] || val["msa-populations"] ? (
          <a class="chip family-farms" href="#exploitations">
            {t("tools_parcel_section_farms")}
          </a>
        ) : (
          ""
        )}
      </nav>
    </header>
  )
}

function renderWeather(
  weather: NonNullable<ParcelIdentifierOkPage["last-year-weather-reports"]>,
  context: Context,
) {
  const { t, numberFormatter } = context
  const hasReports = Object.keys(weather.values).length > 0
  const isStale =
    weather.until !== undefined &&
    Date.now() - new Date(weather.until.iso).getTime() > STALE_AFTER_IN_MS

  return (
    <section class="record" id="meteo">
      <h2 class="dot family-environment">{t("tools_parcel_section_weather")}</h2>
      <p>
        {weather.station.label}{" "}
        <a href={weather.station.href}>{Html.escapeHtml(weather.station.value)}</a>
        {weather.distance
          ? `, ${t("tools_parcel_at")} ${numberFormatter(weather.distance.value)} km`
          : ""}
        .
      </p>
      {isStale && weather.until ? (
        <div class="notice">
          <p>{t("tools_parcel_weather_stale").replace("%s", weather.until.value)}</p>
        </div>
      ) : (
        ""
      )}
      {hasReports ? (
        <figure class="record-chart">
          <figcaption>
            {weather.until
              ? t("tools_parcel_weather_window").replace("%s", weather.until.value)
              : t("tools_station_last_30_days_reports")}
          </figcaption>
          <Chart legend={weather.legend} values={weather.values} height={320} plain />
        </figure>
      ) : (
        <p class="quiet">{t("tools_parcel_no_report")}</p>
      )}
    </section>
  )
}

// A commune may count hundreds of farms: the figures first, the list for who wants it
function renderEnterprises(section: TableSection | undefined, context: Context) {
  if (!section) {
    return ""
  }

  const subsidised = section.rows.filter((row) => {
    const count = (row["subsidy-count"] as { value?: number } | undefined)?.value

    return count !== undefined && count > 0
  }).length

  return (
    <>
      <p>
        {context
          .t("tools_parcel_enterprises_summary")
          .replace("%d", context.numberFormatter(section.rows.length))
          .replace("%d", context.numberFormatter(subsidised))}
      </p>
      <details class="record-fold">
        <summary>{section.label}</summary>
        <div class="table-scroll">{renderTableBody(section, context)}</div>
      </details>
    </>
  )
}

const without = (section: Sections, pattern: RegExp): Sections =>
  section === undefined
    ? undefined
    : Object.fromEntries(Object.entries(section).filter(([key]) => !pattern.test(key)))

function renderDetails(section: Sections, numberFormatter: Context["numberFormatter"]) {
  if (!section || Object.keys(section).length === 0) {
    return ""
  }

  return (
    <dl class="details">
      {Object.entries(section).map(([key, item]) => (
        <>
          <dt>{item.label}</dt>
          <dd>{renderCell(key, item, numberFormatter)}</dd>
        </>
      ))}
    </dl>
  )
}

function renderTableSection(
  section: TableSection | undefined,
  context: Context,
  emptyMessage?: string,
) {
  if (!section) {
    return ""
  }
  if (section.rows.length === 0 && emptyMessage) {
    return <p class="quiet">{emptyMessage}</p>
  }
  return (
    <div>
      <h3>{section.label}</h3>
      <div class="table-scroll">{renderTableBody(section, context)}</div>
    </div>
  )
}

function renderTableBody(
  section: TableSection,
  context: Context,
  emptyMessage?: string,
) {
  const columnKeys = Object.keys(section.columns)
  return (
    <>
      <table>
        <thead>
          <tr>
            {Object.values(section.columns).map((field) => (
              <th>{field}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((item) => (
            <tr>
              {columnKeys.map((field) => (
                <td>
                  {item[field] === undefined ? (
                    <span class="quiet">{context.t("common_undefined")}</span>
                  ) : (
                    renderCell(field, item[field] as Hypermedia, context.numberFormatter)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// A year is not a quantity: no thousands separator
const renderCell = (
  field: string,
  element: Hypermedia,
  numberFormatter: Context["numberFormatter"],
) =>
  /(^|-)year$/.test(field)
    ? String((element as { value?: unknown }).value)
    : renderHypermedia(element, numberFormatter)

function renderHypermedia(
  element: Hypermedia,
  numberFormatter: Context["numberFormatter"],
) {
  return match(element).case({
    Text: (h) => Html.escapeHtml(String(h.value)),
    Number: (h) =>
      numberFormatter(h.value) + (h.unit !== undefined ? " " + h.unit : ""),
    Boolean: (h) => (h.value ? "✓" : "—"),
    Link: (h) => `<a href="${Html.escapeHtml(h.href)}">${Html.escapeHtml(String(h.value))}</a>`,
    Date: (h) => h.value,
    _otherwise: () => "Unknown",
  })
}
