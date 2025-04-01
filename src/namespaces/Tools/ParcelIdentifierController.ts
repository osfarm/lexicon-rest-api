import {
  Concurrently,
  Err,
  match,
  None,
  Ok,
  Some,
  type AsyncResult,
  type Result,
} from "shulk"
import { Hypermedia, hypermedia2json, type HypermediaType } from "../../Hypermedia"
import { Field } from "../../templates/components/Form"
import type { Context } from "../../types/Context"
import {
  ParcelIdentifier,
  type ParcelIdentifierOkPage,
} from "../../templates/pages/ParcelIdentifier"
import { coordinatesToPoint, type Point } from "../../types/Geometry"
import { MunicipalityTable } from "../GeographicalReferences/Municipality"
import { ParcelTable } from "../GeographicalReferences/CadastralParcel"
import { CapParcelTable } from "../GeographicalReferences/CapParcel"
import type { Pool } from "pg"
import { HourlyReportTable, StationTable } from "../Weather"

const RED = "#EE6666"
const BLUE = "#5470C6"

export async function ParcelIdentifierController(
  cxt: Context,
  breadcrumbs: HypermediaType["Link"][],
) {
  const title = cxt.t("tools_parcel_identifier")

  const latitude = cxt.query.latitude ? parseFloat(cxt.query.latitude) : undefined
  const longitude = cxt.query.longitude ? parseFloat(cxt.query.longitude) : undefined

  const form = {
    latitude: Field.Number({
      label: cxt.t("common_fields_latitude"),
      required: true,
      unit: "°",
      defaultValue: latitude,
    }),
    longitude: Field.Number({
      label: cxt.t("common_fields_longitude"),
      required: true,
      unit: "°",
      defaultValue: longitude,
    }),
  }

  const maybeCoordinates =
    latitude && longitude
      ? Some({
          latitude: latitude,
          longitude: longitude,
        })
      : None()

  const legend = {
    "temperature-max": {
      label: cxt.t("weather_station_hourly_report_temperature_max"),
      unit: "°C",
      type: "line",
      color: RED,
      side: "left",
      stack: "Total",
    },
    humidity: {
      label: cxt.t("weather_station_hourly_report_humidity"),
      unit: "%",
      type: "line",
      color: BLUE,
      side: "right",
    },
  }

  const page = await match(maybeCoordinates)
    .returnType<AsyncResult<Error, ParcelIdentifierOkPage>>()
    .case({
      None: async () => Ok({ title, breadcrumbs, form }),
      Some: async ({ val: coordinates }) => {
        const point = coordinatesToPoint(coordinates)

        const parcelDataResult = await retrieveParcelData(cxt.db, point)

        return parcelDataResult.map(
          ({
            municipality,
            cadastralParcel,
            capParcel,
            lastYearWeatherReports,
            weatherStation,
          }) => ({
            title: title,
            breadcrumbs: breadcrumbs,
            form: form,
            information: municipality
              ? {
                  country: Hypermedia.Text({
                    label: cxt.t("common_fields_country"),
                    value: cxt.t("country_" + municipality.country),
                  }),
                  city: Hypermedia.Link({
                    label: cxt.t("geographical_references_municipality_city"),
                    value: municipality.city_name,
                    method: "GET",
                    href: "/geographical-references/municipalities/" + municipality.id,
                  }),
                  "city-code": Hypermedia.Text({
                    label: cxt.t("geographical_references_municipality_city_code"),
                    value: municipality.code,
                  }),
                  "postal-code": Hypermedia.Text({
                    label: cxt.t("geographical_references_municipality_postal_code"),
                    value: municipality.postal_code,
                  }),
                }
              : undefined,
            cadastre: cadastralParcel
              ? {
                  id: Hypermedia.Link({
                    label: cxt.t("geographical_references_cadastral_parcel_id"),
                    value: cadastralParcel.id,
                    method: "GET",
                    href:
                      "/geographical-references/cadastral-parcels/" + cadastralParcel.id,
                  }),
                  prefix: Hypermedia.Text({
                    label: cxt.t(
                      "geographical_references_cadastral_parcel_section_prefix",
                    ),
                    value: cadastralParcel.section_prefix,
                  }),
                  section: Hypermedia.Text({
                    label: cxt.t("geographical_references_cadastral_parcel_section"),
                    value: cadastralParcel.section,
                  }),
                  number: Hypermedia.Text({
                    label: cxt.t("geographical_references_cadastral_parcel_work_number"),
                    value: cadastralParcel.work_number,
                  }),
                  area: Hypermedia.Number({
                    label: cxt.t("geographical_references_cadastral_parcel_area"),
                    value: cadastralParcel.net_surface_area,
                    unit: "m²",
                  }),
                }
              : undefined,
            cap: capParcel
              ? {
                  id: Hypermedia.Link({
                    label: cxt.t("geographical_references_cap_parcel_id"),
                    value: capParcel.id,
                    method: "GET",
                    href: "/geographical-references/cap-parcels/" + capParcel.id,
                  }),
                  "crop-code": Hypermedia.Text({
                    label: cxt.t("geographical_references_cap_parcel_crop_code"),
                    value: capParcel.cap_crop_code,
                  }),
                  culture: Hypermedia.Text({
                    label: cxt.t("geographical_references_cap_parcel_culture"),
                    value: capParcel.cap_label,
                  }),
                }
              : undefined,
            "last-year-weather-reports": lastYearWeatherReports
              ? {
                  station: Hypermedia.Link({
                    label: cxt.t("weather_station"),
                    value:
                      weatherStation?.station_name + " " + weatherStation?.station_code ||
                      "",
                    method: "GET",
                    href: "/weather/stations/" + weatherStation?.reference_name,
                  }),
                  legend: legend,
                  values: lastYearWeatherReports.reduce((prev, curr) => {
                    const item = {
                      "temperature-max": parseFloat(curr.max_temp as any),
                      humidity: parseFloat(curr.humidity as any),
                    }

                    return {
                      ...prev,
                      [cxt.dateTimeFormatter.DateTime(curr.started_at)]: item,
                    }
                  }, {}),
                }
              : undefined,
            geolocation: cadastralParcel?.shape
              ? {
                  coordinates: maybeCoordinates.unwrapOr({
                    latitude: 0,
                    longitude: 0,
                  }),
                  marker: point,
                  shape: cadastralParcel.shape,
                }
              : undefined,
          }),
        )
      },
    })

  return match(cxt.output)
    .returnType<unknown>()
    .case({
      json: () => hypermedia2json(cxt.request, page.val),
      geojson: () => page.map((page) => page.geolocation?.shape).unwrapOr({}),
      html: () => ParcelIdentifier({ page, t: cxt.t }),
      _otherwise: () => "Format not supported",
    })
}

async function retrieveParcelData(db: Pool, point: Point) {
  const searchMunicipalityQuery = MunicipalityTable(db)
    .select()
    .where("city_shape", "ST_CONTAINS", point)
    .limit(1)

  const searchCadastralParcelQuery = ParcelTable(db)
    .select()
    .where("shape", "ST_CONTAINS", point)
    .limit(1)

  const searchCAPParcelQuery = CapParcelTable(db)
    .select()
    .where("shape", "ST_CONTAINS", point)
    .limit(1)

  // HourlyReportTable(db).select().where('')

  // prettier-ignore
  const queriesResult = await Concurrently
    .run(() => searchMunicipalityQuery.run())
    .and(() => searchCadastralParcelQuery.run())
    .and(() => searchCAPParcelQuery.run())
    .done()

  const searchStationQuery = await queriesResult
    .map(([municipalities]) => municipalities[0])
    .flatMap(checkUndefined)
    .flatMapAsync((municipality) =>
      StationTable(db)
        .select()
        .where("country", "=", municipality.country)
        .where("centroid", "ST_WITHIN", municipality.city_shape)
        .run(),
    )

  const stationResult = searchStationQuery
    .map((stations) => stations[0])
    .flatMap(checkUndefined)

  const currentDate = new Date()
  currentDate.setFullYear(currentDate.getFullYear() - 1)
  const oneYearAgo = currentDate.toISOString()

  const fetchReportsResult = await stationResult.flatMapAsync((station) =>
    HourlyReportTable(db)
      .select()
      .where("station_id", "=", station.reference_name)
      .where("started_at", ">=", oneYearAgo)
      .orderBy("started_at", "ASC")
      .run(),
  )

  return queriesResult.map(([municipalities, cadastralParcels, capParcels]) => ({
    municipality: municipalities[0] || undefined,
    cadastralParcel: cadastralParcels[0] || undefined,
    capParcel: capParcels[0] || undefined,
    lastYearWeatherReports: fetchReportsResult.unwrapOr(undefined),
    weatherStation: stationResult.unwrapOr(undefined),
  }))
}

function checkUndefined<T>(value: T): Result<Error, T> {
  if (value === undefined) {
    return Err(new Error(""))
  } else {
    return Ok(value)
  }
}
