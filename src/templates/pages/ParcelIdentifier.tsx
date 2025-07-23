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
import type { Context } from "../../types/Context"
import { Table } from "../../Database"

export interface ParcelIdentifierOkPage {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: FormDefinition
  information?: Record<string, Hypermedia>
  cadastre?: Record<string, Hypermedia>
  price?: Record<string, Hypermedia>
  cap?: Record<string, Hypermedia>
  transactions?: {
    label: string
    columns: Record<string, string>
    rows: Record<string, HypermediaType["any"]>[]
  }
  "last-year-weather-reports"?: {
    station: HypermediaType["Link"]
    legend: {}
    values: {}
  }
  geolocation?: {
    coordinates: Coordinates
    shape: MultiPolygon
  }
}

interface Props {
  context: Context
  page: Result<Error, ParcelIdentifierOkPage>
}

const DEFAULT_LATITUDE = 48.831561189145276
const DEFAULT_LONGITUDE = 2.2884060615145954

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
        {renderSection(
          t("tools_parcel_identifier_information"),
          numberFormatter,
          val.information,
        )}
        {renderSection(
          t("tools_parcel_identifier_cadastre"),
          numberFormatter,
          val.cadastre,
        )}{" "}
        {renderSection(t("tools_parcel_identifier_cap"), numberFormatter, val.cap)}
        {val.transactions && (
          <div>
            <h2>{val.transactions.label}</h2>
            <table>
              <thead>
                <tr>
                  {Object.values(val.transactions.columns).map((field) => (
                    <th>{field}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {val.transactions.rows.map((item) => (
                  <tr>
                    {Object.keys(val.transactions?.columns || {}).map((field) => (
                      <td>
                        {item[field] === undefined ? (
                          <i>{context.t("common_undefined")}</i>
                        ) : (
                          renderHypermedia(item[field], context.numberFormatter)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>{" "}
            {val.transactions.rows.length === 0 && (
              <p style={{ textAlign: "center", fontStyle: "italic" }}>
                {context.t("tools_no_transaction")}
              </p>
            )}
          </div>
        )}
        {val["last-year-weather-reports"] !== undefined && (
          <>
            <h2>{t("tools_station_last_year_reports")}</h2>

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

function renderHypermedia(
  element: Hypermedia,
  numberFormatter: Context["numberFormatter"],
) {
  return match(element).case({
    Text: (h) => h.value,
    Number: (h) => numberFormatter(h.value) + " " + h.unit,
    Link: (h) => `<a href="${h.href}">${h.value}</a>`,
    Date: (h) => h.value,
    _otherwise: () => "Unknown",
  })
}
