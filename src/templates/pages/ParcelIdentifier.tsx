import { Html } from "@elysiajs/html"
import type { Translator } from "../../Translator"
import { Layout } from "../layouts/Layout"
import { type FormDefinition } from "../components/Form"
import { match, type Result } from "shulk"
import { Error } from "../components/Error"
import type { Hypermedia, HypermediaType } from "../../Hypermedia"
import type { Coordinates } from "../../types/Coordinates"
import type { MultiPolygon } from "../../types/Geometry"
import { MapSelector } from "../components/MapSelector"
import { Chart } from "../components/Chart"
import { Card } from "../components/Card"
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

export function ParcelIdentifier(props: Props) {
  const { page, context } = props

  const { t, numberFormatter } = context

  return match(page).case({
    Err: ({ val: error }) => <Error error={error} />,
    Ok: ({ val }) => (
      <Layout title={val.title} breadcrumbs={val.breadcrumbs} t={t}>
        <MapSelector
          center={{ latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE }}
          t={t}
          marker={val.geolocation?.coordinates}
          shape={val.geolocation?.shape}
        />
        <div class="card-grid">
          {renderCard(
            t("tools_parcel_identifier_information"),
            numberFormatter,
            val.information,
          )}
          {renderCard(
            t("tools_parcel_identifier_cadastre"),
            numberFormatter,
            val.cadastre,
          )}
          {renderCard(t("tools_parcel_identifier_cap"), numberFormatter, val.cap)}
          {renderCard(t("tools_soil"), numberFormatter, val.soil)}
          {renderTableCard(val.transactions, context, t("tools_no_transaction"))}
          {renderTableCard(val.owners, context)}
        </div>
        {renderTableSection(val["natural-zones"], context)}
        {renderTableSection(val["protected-water-zones"], context)}
        {renderTableSection(val["area-items"], context)}
        {val["historical-yields"] !== undefined && (
          <>
            <h2>{t("tools_historical_yields")}</h2>
            <span>
              <b>{val["historical-yields"].production.label}</b>{" "}
              {val["historical-yields"].production.value}
            </span>
            <Chart
              legend={val["historical-yields"].legend}
              values={val["historical-yields"].values}
            />
          </>
        )}
        {renderTableSection(val["agricultural-enterprises"], context)}
        {renderTableSection(val["msa-populations"], context)}
        {val["last-year-weather-reports"] !== undefined && (
          <>
            <h2>{t("tools_station_last_30_days_reports")}</h2>

            <span>
              <b>{val["last-year-weather-reports"].station.label}</b>{" "}
              <a href={val["last-year-weather-reports"].station.href}>
                {val["last-year-weather-reports"].station.value}
              </a>
            </span>

            <Chart
              legend={val["last-year-weather-reports"].legend}
              values={val["last-year-weather-reports"].values}
            />
          </>
        )}
      </Layout>
    ),
  })
}

function renderSection(
  title: string,
  numberFormatter: Context["numberFormatter"],
  section?: Record<string, Hypermedia>,
) {
  if (!section) {
    return
  } else {
    return (
      <div>
        <h2>{title}</h2>

        {Object.values(section)
          .map((h) => (
            <span>
              <b>{h.label}</b> {renderHypermedia(h, numberFormatter)}
            </span>
          ))
          .join("<br />")}
      </div>
    )
  }
}

function renderCard(
  title: string,
  numberFormatter: Context["numberFormatter"],
  section?: Record<string, Hypermedia>,
) {
  if (!section || Object.keys(section).length === 0) {
    return
  }
  return (
    <Card>
      <h2>{title}</h2>
      {Object.values(section)
        .map((h) => (
          <span>
            <b>{h.label}</b> {renderHypermedia(h, numberFormatter)}
          </span>
        ))
        .join("")}
    </Card>
  )
}

function renderTableSection(
  section: TableSection | undefined,
  context: Context,
  emptyMessage?: string,
) {
  if (!section) {
    return
  }
  return (
    <div>
      <h2>{section.label}</h2>
      {renderTableBody(section, context, emptyMessage)}
    </div>
  )
}

function renderTableCard(
  section: TableSection | undefined,
  context: Context,
  emptyMessage?: string,
) {
  if (!section) {
    return
  }
  return (
    <Card>
      <h2>{section.label}</h2>
      {renderTableBody(section, context, emptyMessage)}
    </Card>
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
                    <i>{context.t("common_undefined")}</i>
                  ) : (
                    renderHypermedia(item[field] as Hypermedia, context.numberFormatter)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {section.rows.length === 0 && emptyMessage && (
        <p style={{ textAlign: "center", fontStyle: "italic" }}>{emptyMessage}</p>
      )}
    </>
  )
}

function renderHypermedia(
  element: Hypermedia,
  numberFormatter: Context["numberFormatter"],
) {
  return match(element).case({
    Text: (h) => h.value,
    Number: (h) =>
      numberFormatter(h.value) + (h.unit !== undefined ? " " + h.unit : ""),
    Boolean: (h) => (h.value ? "✓" : "✗"),
    Link: (h) => `<a href="${h.href}">${h.value}</a>`,
    Date: (h) => h.value,
    _otherwise: () => "Unknown",
  })
}
