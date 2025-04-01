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

export interface ParcelIdentifierOkPage {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: FormDefinition
  information?: Record<string, Hypermedia>
  cadastre?: Record<string, Hypermedia>
  cap?: Record<string, Hypermedia>
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
  t: Translator
  page: Result<Error, ParcelIdentifierOkPage>
}

const DEFAULT_LATITUDE = 48.831561189145276
const DEFAULT_LONGITUDE = 2.2884060615145954

export function ParcelIdentifier(props: Props) {
  const { page, t } = props

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
        {renderSection(t("tools_parcel_identifier_information"), val.information)}
        {renderSection(t("tools_parcel_identifier_cadastre"), val.cadastre)}
        {renderSection(t("tools_parcel_identifier_cap"), val.cap)}
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

function renderSection(title: string, section?: Record<string, Hypermedia>) {
  if (!section) {
    return
  } else {
    return (
      <div>
        <h2>{title}</h2>

        {Object.values(section)
          .map((h) => (
            <span>
              <b>{h.label}</b> {renderHypermedia(h)}
            </span>
          ))
          .join("<br />")}
      </div>
    )
  }
}

function renderHypermedia(element: Hypermedia) {
  return match(element).case({
    Text: (h) => h.value,
    Number: (h) => h.value + " " + h.unit,
    Link: (h) => `<a href="${h.href}">${h.value}</a>`,
    _otherwise: () => "Unknown",
  })
}
