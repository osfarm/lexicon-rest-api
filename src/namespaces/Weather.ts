import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia } from "../Hypermedia"
import { AutoList } from "../templates/views/AutoList"
import { Country } from "../types/Country"
import { CreditTable } from "./Credits"
import { ObjectFlatMap } from "../utils"
import { Field } from "../templates/components/Form"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"
import type { Point } from "../types/Geometry"
import { generateMapSection } from "../page-generators/generateMapSection"
import { pointToCoordinates } from "../types/Coordinates"
import { generateResourcePage } from "../page-generators/generateResourcePage"
import { MunicipalityTable } from "./GeographicalReferences/Municipality"

interface Station {
  reference_name: string
  country: Country
  country_zone: string
  station_code: string
  station_name: string
  elevation: Meters
  centroid: Point
}

type Meters = number

export const StationTable = Table<Station>({
  table: "registered_weather_stations",
  primaryKey: "reference_name",
  geometry: ["centroid"],
})

type HourlyReport = {
  station_id: string
  started_at: Date
  mesured_delay: unknown
  min_temp?: string
  max_temp?: string
  rain?: string
  max_wind_speed?: string
  wind_direction?: string
  frozen_duration?: string
  humidity?: string
  soil_state?: string
  pressure?: string
  weather_description?: string
}

const HourlyReportTable = Table<HourlyReport>({
  table: "registered_hourly_weathers",
  primaryKey: "station_id",
})

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("weather_title"),
    method: "GET",
    href: "/weather",
  }),
]

export const Weather = new Elysia({
  prefix: "/weather",
})
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("weather_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("weather_station_title"),
            method: "GET",
            href: "/weather/stations",
          }),
        ],
      },
      t,
    })
  )
  .get(
    "/stations*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("weather_station_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        form: {
          country: Field.Select({
            label: cxt.t("common_fields_country"),
            options: ObjectFlatMap(Country, (_, value) => ({
              [value]: cxt.t("country_" + value.toUpperCase()),
            })),
            required: false,
          }),
          name: Field.Text({
            label: cxt.t("common_fields_name"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.country) {
            query.where("country", "=", input.country)
          }
          if (input.name) {
            query.where("station_name", "LIKE", `%${input.name}%`)
          }
        },
        query: StationTable(cxt.db)
          .select()
          .orderBy("country", "ASC")
          .orderBy("station_code", "ASC"),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "weather"),
        columns: {
          country: cxt.t("common_fields_country"),
          code: cxt.t("weather_station_code"),
          name: cxt.t("common_fields_name"),
          elevation: cxt.t("weather_station_elevation"),
          details: cxt.t("common_details"),
        },
        handler: (station) => ({
          country: Hypermedia.Text({
            label: cxt.t("common_fields_country"),
            value: cxt.t("country_" + station.country),
          }),
          code: Hypermedia.Text({
            label: cxt.t("weather_station_code"),
            value: station.station_code,
          }),
          name: Hypermedia.Text({
            label: cxt.t("common_fields_name"),
            value: station.station_name,
          }),
          elevation: Hypermedia.Number({
            label: cxt.t("weather_station_elevation"),
            value: station.elevation,
            unit: "m",
          }),
          details: Hypermedia.Link({
            label: cxt.t("weather_station_hourly_reports"),
            value: cxt.t("common_see"),
            method: "GET",
            href: `/weather/stations/${station.reference_name}`,
          }),
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        country: t.Optional(t.String()),
        name: t.Optional(t.String()),
      }),
    }
  )
  .get("/stations/:reference", (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("weather_station_title"),
          method: "GET",
          href: "/weather/stations",
        }),
      ],
      handler: async (reference) => {
        const readStationResult = await StationTable(cxt.db).read(reference)

        const searchMunicipalityResult = await readStationResult
          .map((station) => station.station_name)
          .flatMapAsync((name) =>
            MunicipalityTable(cxt.db)
              .select()
              .where("city_name", "=", name)
              .limit(1)
              .run()
          )

        const associatedMunicipality = searchMunicipalityResult
          .toMaybe()
          .filter((municipalities) => municipalities.length > 0)
          .map((municipalities) => municipalities[0])
          .unwrapOr(undefined)

        return readStationResult.map((station) => ({
          title: station.reference_name,
          details: {
            name: Hypermedia.Text({
              label: cxt.t("common_fields_name"),
              value: station.station_name,
            }),
            code: Hypermedia.Text({
              label: cxt.t("weather_station_code"),
              value: station.station_code,
            }),
            country: Hypermedia.Text({
              label: cxt.t("common_fields_country"),
              value: cxt.t("country_" + station.country),
            }),
            municipality: associatedMunicipality
              ? Hypermedia.Link({
                  label: cxt.t("geographical_references_municipality"),
                  value: associatedMunicipality.city_name,
                  method: "GET",
                  href: `/geographical-references/municipalities/${associatedMunicipality.id}`,
                })
              : undefined,
            elevation: Hypermedia.Number({
              label: cxt.t("weather_station_elevation"),
              value: station.elevation,
              unit: "m",
            }),
          },
          sections: {
            geolocation: Hypermedia.Link({
              value: cxt.t("common_location"),
              method: "GET",
              href: `/weather/stations/${reference}/geolocation`,
            }),
          },
          links: [
            Hypermedia.Link({
              value: cxt.t("weather_station_hourly_reports"),
              method: "GET",
              href: `/weather/stations/${reference}/hourly-reports`,
            }),
            ...(associatedMunicipality
              ? [
                  Hypermedia.Link({
                    label: cxt.t("common_fields_city"),
                    value: associatedMunicipality.city_name,
                    method: "GET",
                    href: `/geographical-references/municipalities/${associatedMunicipality.id}`,
                  }),
                ]
              : []),
          ],
        }))
      },
    })
  )
  .get("/stations/:reference/geolocation*", async (cxt: Context) => {
    const readStationResult = await StationTable(cxt.db).read(cxt.params.reference)

    return readStationResult
      .map((station) => station.centroid)
      .map(pointToCoordinates)
      .map((center) => ({
        output: cxt.output,
        center: center,
        markers: [center],
        shapes: [],
      }))
      .map(generateMapSection).val
  })
  .get(
    "/stations/:reference/hourly-reports*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("weather_station_hourly_reports"),
        breadcrumbs: [
          ...Breadcrumbs(cxt.t),
          Hypermedia.Link({
            value: cxt.t("weather_station_title"),
            method: "GET",
            href: "/weather/stations",
          }),
          Hypermedia.Link({
            value: cxt.t(cxt.params.reference),
            method: "GET",
            href: "/weather/stations/" + cxt.params.reference,
          }),
        ],
        form: {
          start: Field.DateTime({
            label: cxt.t("common_fields_date_start"),
            required: false,
          }),
          end: Field.DateTime({
            label: cxt.t("common_fields_date_end"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.start) {
            query.where("started_at", ">", input.start)
          }
          if (input.end) {
            query.where("started_at", "<", input.end)
          }
        },

        query: HourlyReportTable(cxt.db)
          .select()
          .where("station_id", "=", cxt.params?.reference)
          .orderBy("started_at", "ASC"),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "weather"),
        columns: {
          datetime: cxt.t("common_fields_datetime"),
          "temperature-min": cxt.t("weather_station_hourly_report_temperature_min"),
          "temperature-max": cxt.t("weather_station_hourly_report_temperature_max"),
          humidity: cxt.t("weather_station_hourly_report_humidity"),
          rain: cxt.t("weather_station_hourly_report_rain"),
          "wind-speed": cxt.t("weather_station_hourly_report_wind_speed"),
          "wind-direction": cxt.t("weather_station_hourly_report_wind_direction"),
          pressure: cxt.t("weather_station_hourly_report_pressure"),
        },
        handler: (report) => ({
          datetime: Hypermedia.Date({
            label: cxt.t("common_fields_datetime"),
            value: cxt.dateTimeFormatter.DateTime(report.started_at),
            iso: report.started_at.toISOString(),
          }),
          "temperature-min": report.min_temp
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_temperature_min"),
                value: parseInt(report.min_temp),
                unit: "°C",
              })
            : undefined,
          "temperature-max": report.max_temp
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_temperature_min"),
                value: parseInt(report.max_temp),
                unit: "°C",
              })
            : undefined,
          humidity: report.humidity
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_humidity"),
                value: parseInt(report.humidity),
                unit: "%",
              })
            : undefined,
          rain: report.rain
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_rain"),
                value: parseInt(report.rain),
                unit: "mm",
              })
            : undefined,
          "wind-speed": report.max_wind_speed
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_wind_speed"),
                value: parseInt(report.max_wind_speed),
                unit: "km / h",
              })
            : undefined,
          "wind-direction": report.wind_direction
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_wind_direction"),
                value: parseInt(report.wind_direction),
                unit: "°",
              })
            : undefined,
          pressure: report.pressure
            ? Hypermedia.Number({
                label: cxt.t("weather_station_hourly_report_pressure"),
                value: parseInt(report.pressure),
                unit: "hPa",
              })
            : undefined,
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
    }
  )
