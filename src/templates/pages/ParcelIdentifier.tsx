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
  // Water within about 500 m, the closest first; distances in metres
  // permanent, ditch, water-police and width say whether a buffer zone is counted from it
  water?: {
    nature: string
    name?: string
    distance: number
    permanent?: boolean
    ditch?: boolean
    "water-police"?: string
    width?: string
  }[]
  // Around the cadastral parcel: dwellings within 100 m and the closest one,
  // metres of hedge along it, woods, vines and orchards on it or within 100 m
  surroundings?: {
    dwellings?: { within: number; count: number; nearest?: number }
    hedges?: number
    vegetation?: { nature: string; area: number; share: number; distance: number }[]
    // Schools, hospitals, homes for the elderly within about 500 m
    "sensitive-sites"?: { kind: string; name?: string; distance: number }[]
    // High-voltage lines over the parcel (distance 0) or within 100 m
    "power-lines"?: { voltage: string; distance: number }[]
  }
  // What Lexicon holds about the crop declared here, each with where to read it
  "crop-context"?: {
    production: string
    label: string
    price?: {
      value: number
      unit: string
      campaign: number
      specie: string
      nature: string
      national: boolean
    }
    "gross-product"?: {
      value: number
      unit: string
      yield: number
      "yield-campaign": number
      "price-campaign": number
    }
    usages?: { crop: string; count: number; products: number; href: string }
    documents?: {
      area: { kind: string; code: string }
      total: number
      href: string
      latest: { id: string; title: string; year?: number; publisher?: string; href: string }[]
    }
    workflows?: { count: number; href: string }
  }
  soil?: Record<string, Hypermedia>
  links?: Record<string, HypermediaType["Link"]>
  transactions?: TableSection
  owners?: TableSection
  // Why no owner is listed
  "owners-note"?: "members-only" | "no-legal-person"
  // For a visitor without a key: the first two characters of each value of the owners
  "owners-preview"?: {
    label: string
    columns: Record<string, string>
    rows: Record<string, string>[]
  }
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
        {val["crop-context"] ? renderCropContext(val["crop-context"], context) : ""}
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
        {val["owners-preview"] ? (
          renderReserved(val["owners-preview"], context)
        ) : val["owners-note"] === "members-only" ? (
          <p class="quiet owners-note">
            {t("tools_owners_members_only")}{" "}
            <a href="https://www.osfarm.org/">{t("home_commons_join")}</a>
          </p>
        ) : val["owners-note"] === "no-legal-person" ? (
          <p class="quiet owners-note">{t("tools_owners_none")}</p>
        ) : (
          ""
        )}
      </section>

      <section class="record" id="sol">
        <h2 class="dot family-environment">{t("tools_parcel_section_environment")}</h2>
        {val.soil ? renderDetails(val.soil, numberFormatter) : ""}
        {val.water ? renderWater(val.water, context) : ""}
        {val.surroundings ? renderSurroundings(val.surroundings, context) : ""}
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

const UNITS: Record<string, string> = { ton: "t", quintal: "q", kilogram: "kg", liter: "L" }

// What can be read elsewhere in Lexicon about the crop of the parcel: a sentence
// for each, with the figure and the page behind it
function renderCropContext(
  crop: NonNullable<ParcelIdentifierOkPage["crop-context"]>,
  context: Context,
) {
  const { t, numberFormatter } = context
  const fill = (key: string, ...values: (string | number)[]) =>
    values.reduce<string>((sentence, value) => sentence.replace("%s", String(value)), t(key))
  const gross = crop["gross-product"]

  if (!crop.price && !crop.usages && !crop.documents && !crop.workflows) {
    return ""
  }

  return (
    <div class="crop-context">
      <h3>{fill("tools_parcel_crop_context", Html.escapeHtml(crop.label.toLocaleLowerCase(context.language)))}</h3>
      <ul>
        {crop.price ? (
          <li>
            {fill(
              "tools_parcel_crop_price",
              numberFormatter(crop.price.value),
              UNITS[crop.price.unit] ?? crop.price.unit,
              crop.price.campaign,
              t("tools_parcel_price_" + crop.price.nature),
              t(crop.price.national ? "tools_parcel_price_national" : "tools_parcel_price_local"),
            )}
            {gross
              ? " " +
                fill(
                  "tools_parcel_crop_gross",
                  numberFormatter(gross.value),
                  numberFormatter(gross.yield),
                  gross["yield-campaign"],
                )
              : ""}
          </li>
        ) : (
          ""
        )}
        {crop.usages ? (
          <li>
            <a href={crop.usages.href}>
              {fill("tools_parcel_crop_usages", numberFormatter(crop.usages.products))}
            </a>{" "}
            {fill(
              "tools_parcel_crop_usages_detail",
              Html.escapeHtml(crop.usages.crop),
              numberFormatter(crop.usages.count),
            )}
          </li>
        ) : (
          ""
        )}
        {crop.workflows ? (
          <li>
            <a href={crop.workflows.href}>
              {fill("tools_parcel_crop_workflows", crop.workflows.count)}
            </a>
          </li>
        ) : (
          ""
        )}
        {crop.documents ? (
          <li>
            <a href={crop.documents.href}>
              {fill("tools_parcel_crop_documents", numberFormatter(crop.documents.total))}
            </a>{" "}
            {t("tools_parcel_crop_documents_" + crop.documents.area.kind)}
            <ul class="documents">
              {crop.documents.latest.map((document) => (
                <li>
                  <a href={document.href}>{Html.escapeHtml(document.title)}</a>
                  <span class="quiet">
                    {" "}
                    {Html.escapeHtml(
                      [document.publisher, document.year].filter(Boolean).join(", "),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ) : (
          ""
        )}
      </ul>
    </div>
  )
}

// What the IGN says of a stretch of water, the legal status first
function waterDetails(
  item: NonNullable<ParcelIdentifierOkPage["water"]>[number],
  context: Context,
) {
  const { t } = context
  const details = [
    item["water-police"] === "Inscrit"
      ? t("tools_parcel_water_police")
      : item["water-police"] === "Non inscrit"
        ? t("tools_parcel_water_not_police")
        : item["water-police"] === "Expertise en cours"
          ? t("tools_parcel_water_police_pending")
          : undefined,
    item.ditch ? t("tools_parcel_water_ditch") : undefined,
    item.permanent === true
      ? t("tools_parcel_water_permanent")
      : item.permanent === false
        ? t("tools_parcel_water_intermittent")
        : undefined,
    item.width ? item.width.toLocaleLowerCase(context.language) + " " + t("tools_parcel_water_wide") : undefined,
  ].filter((detail): detail is string => detail !== undefined)

  return details.length > 0 ? (
    <span class="quiet"> {Html.escapeHtml("— " + details.join(", "))}</span>
  ) : (
    ""
  )
}

// Buffer zones of plant protection products are counted from the water: the
// closest ones are named with their distance
function renderWater(
  water: NonNullable<ParcelIdentifierOkPage["water"]>,
  context: Context,
) {
  const { t, numberFormatter } = context

  return (
    <div class="water-nearby">
      <h3>{t("tools_parcel_water")}</h3>
      <ul>
        {water.map((item) => (
          <li>
            {Html.escapeHtml(item.name ? `${item.name} (${item.nature.toLocaleLowerCase(context.language)})` : item.nature)}
            {", "}
            {item.distance === 0
              ? t("tools_parcel_water_on")
              : `${t("tools_parcel_at")} ${numberFormatter(item.distance)} m`}
            {waterDetails(item, context)}
          </li>
        ))}
      </ul>
      <p class="quiet">{t("tools_parcel_water_why")}</p>
    </div>
  )
}

// What stands for the hidden part of a reserved value: the same letters for
// everyone, so that nothing of the value is in the page but its first characters
const VEIL = { denomination: "xxxxxxxxxxxxxx", siren: "0000000" } as Record<string, string>
const VEIL_BY_DEFAULT = "xxxx"

// Data reserved to members, outlined in orange: the start of each value is
// readable, the rest is blurred
function renderReserved(
  preview: NonNullable<ParcelIdentifierOkPage["owners-preview"]>,
  context: Context,
) {
  const { t } = context
  const fields = Object.keys(preview.columns)

  return (
    <div class="reserved">
      <h3>
        {preview.label} <span class="reserved-tag">{t("tools_reserved_tag")}</span>
      </h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              {fields.map((field) => (
                <th>{preview.columns[field]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr>
                {fields.map((field) => (
                  <td>
                    {row[field] === undefined ? (
                      ""
                    ) : (
                      <>
                        {Html.escapeHtml(row[field])}
                        <span class="veiled" aria-hidden="true">
                          {VEIL[field] ?? VEIL_BY_DEFAULT}
                        </span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="quiet">
        {t("tools_reserved_why")} <a href="https://www.osfarm.org/">{t("home_commons_join")}</a>
      </p>
    </div>
  )
}

// Dwellings set the safety distances of treatments; hedges and woods are what
// the parcel is bordered with
function renderSurroundings(
  around: NonNullable<ParcelIdentifierOkPage["surroundings"]>,
  context: Context,
) {
  const { t, numberFormatter } = context
  const fill = (key: string, ...values: (string | number)[]) =>
    values.reduce<string>((text, value) => text.replace("%s", String(value)), t(key))
  const { dwellings, hedges, vegetation = [] } = around
  const sites = around["sensitive-sites"] ?? []
  const lines = around["power-lines"] ?? []

  if (
    dwellings === undefined &&
    hedges === undefined &&
    vegetation.length + sites.length + lines.length === 0
  ) {
    return ""
  }

  return (
    <div class="water-nearby">
      <h3>{t("tools_parcel_around")}</h3>
      <ul>
        {dwellings ? (
          <li>
            {dwellings.nearest === undefined
              ? t("tools_parcel_dwellings_none")
              : fill(
                  dwellings.nearest === 0
                    ? "tools_parcel_dwellings_on"
                    : "tools_parcel_dwellings",
                  numberFormatter(dwellings.count),
                  dwellings.within,
                  numberFormatter(dwellings.nearest),
                )}
          </li>
        ) : (
          ""
        )}
        {sites.map((site) => (
          <li>
            {Html.escapeHtml(site.name ? `${site.name} (${site.kind.toLocaleLowerCase(context.language)})` : site.kind)}
            {" : "}
            {site.distance === 0
              ? t("tools_parcel_water_on")
              : `${t("tools_parcel_at")} ${numberFormatter(site.distance)} m`}
          </li>
        ))}
        {hedges !== undefined ? (
          <li>
            {hedges === 0
              ? t("tools_parcel_hedges_none")
              : fill("tools_parcel_hedges", numberFormatter(hedges))}
          </li>
        ) : (
          ""
        )}
        {vegetation.map((item) => (
          <li>
            {Html.escapeHtml(item.nature)}
            {" : "}
            {item.area > 0
              ? fill("tools_parcel_vegetation_on", numberFormatter(item.area), item.share)
              : `${t("tools_parcel_at")} ${numberFormatter(item.distance)} m`}
          </li>
        ))}
        {lines.map((line) => (
          <li>
            {fill("tools_parcel_power_line", Html.escapeHtml(line.voltage))}{" "}
            {line.distance === 0
              ? t("tools_parcel_power_line_over")
              : `${t("tools_parcel_at")} ${numberFormatter(line.distance)} m`}
          </li>
        ))}
      </ul>
      <p class="quiet">{t("tools_parcel_around_why")}</p>
    </div>
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
