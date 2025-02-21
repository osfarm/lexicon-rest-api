import Elysia, { t } from "elysia"
import type { Context } from "../../types/Context"
import { generateTablePage } from "../../page-generators/generateTablePage"
import { isString, ObjectFlatMap } from "../../utils"
import { Field } from "../../templates/components/Form"
import { MunicipalityTable } from "./Municipality"
import { CreditTable } from "../Credits"
import { Hypermedia, hypermedia2json } from "../../Hypermedia"
import { StationTable } from "../Weather"
import { match } from "shulk"
import { ResourcePage } from "../../templates/views/ResourcePage"
import { MunicipalityFilters } from "./MunicipalityFilters"
import { pointToCoordinates } from "../../types/Coordinates"
import { generateMapSection } from "../../page-generators/generateMapSection"
import type { Translator } from "../../Translator"
import { Country } from "../../types/Country"
import { ParcelTable } from "./CadastralParcel"
import { BadRequest, NotFound } from "../../types/HTTPErrors"
import { generateResourcePage } from "../../page-generators/generateResourcePage"
import { CapParcelTable } from "./CapParcel"

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("geographical_references_title"),
    method: "GET",
    href: "/geographical-references",
  }),
]

export const MunicipalityAPI = new Elysia()
  .get(
    "/municipalities*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_municipality_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        form: {
          country: Field.Select({
            label: cxt.t("common_fields_country"),
            options: ObjectFlatMap(Country, (_, value) => ({
              [value]: cxt.t("country_" + value),
            })),
            required: false,
          }),
          city: Field.Text({
            label: cxt.t("geographical_references_municipality_city"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.country) {
            query.where("country", "=", input.country)
          }
          if (isString(input.city)) {
            query.where("city_name", "LIKE", `%${input.city.toUpperCase()}%`)
          }
        },
        query: MunicipalityTable(cxt.db)
          .select()
          .orderBy("country", "ASC")
          .orderBy("city_name", "ASC"),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "municipalitys"),
        columns: {
          country: cxt.t("common_fields_country"),
          city: cxt.t("geographical_references_municipality_city"),
          "city-code": cxt.t("geographical_references_municipality_city_code"),
          "postal-code": cxt.t("geographical_references_municipality_postal_code"),
          details: cxt.t("common_details"),
        },
        handler: (municipality) => ({
          country: Hypermedia.Text({
            label: cxt.t("common_fields_country"),
            value: cxt.t("country_" + municipality.country),
          }),
          city: Hypermedia.Text({
            label: cxt.t("geographical_references_municipality_postal_code"),
            value: municipality.city_name,
          }),
          "city-code": Hypermedia.Text({
            label: cxt.t("geographical_references_municipality_postal_code_code"),
            value: municipality.code,
          }),
          "postal-code": Hypermedia.Text({
            label: cxt.t("geographical_references_municipality_code"),
            value: municipality.postal_code,
          }),
          details: Hypermedia.Link({
            value: cxt.t("common_see"),
            method: "GET",
            href: `/geographical-references/municipalities/${municipality.id}`,
          }),
        }),
      }),
    {
      query: t.Object({
        page: t.Optional(t.Number({ default: 1 })),
        country: t.Optional(t.String()),
        city: t.Optional(t.String()),
      }),
    }
  )
  .get("/municipalities/:id", async (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_municipality_title"),
          method: "GET",
          href: "/geographical-references/municipalities",
        }),
      ],
      handler: async (id) => {
        const readMunicipalityResult = await MunicipalityTable(cxt.db).read(id)

        const searchStationsResult = await readMunicipalityResult.flatMapAsync(
          (municipality) =>
            StationTable(cxt.db)
              .select()
              .where("station_name", "=", municipality.city_name)
              .run()
        )

        const associatedStations = searchStationsResult.unwrapOr([])

        return readMunicipalityResult.map((municipality) => ({
          title: municipality.city_name,
          details: {
            country: Hypermedia.Text({
              label: cxt.t("common_fields_country"),
              value: cxt.t("country_" + municipality.country),
            }),
            code: Hypermedia.Text({
              label: cxt.t("geographical_references_municipality_city_code"),
              value: municipality.code,
            }),
            "postal-code": Hypermedia.Text({
              label: cxt.t("geographical_references_municipality_postal_code"),
              value: municipality.postal_code,
            }),
          },
          sections: {
            cadastre: MunicipalityFilters.hasGeolocation(municipality)
              .map(() =>
                Hypermedia.Link({
                  value: cxt.t("geographical_references_municipality_cadastre"),
                  method: "GET",
                  href: `/geographical-references/municipalities/${municipality.id}/cadastre`,
                })
              )
              .unwrapOr(undefined),
            cap: MunicipalityFilters.hasGeolocation(municipality)
              .map(() =>
                Hypermedia.Link({
                  value: cxt.t("geographical_references_municipality_cap"),
                  method: "GET",
                  href: `/geographical-references/municipalities/${municipality.id}/cap-parcels`,
                })
              )
              .unwrapOr(undefined),
          },
          links: associatedStations.flatMap((station) => [
            Hypermedia.Link({
              value: cxt.t("weather_station") + " " + station.reference_name,
              method: "GET",
              href: `/weather/stations/${station.reference_name}`,
            }),
            Hypermedia.Link({
              value:
                cxt.t("geographical_references_municipality_weather_reports") +
                ` (${cxt.t("weather_station")} ${station.reference_name})`,
              method: "GET",
              href: `/weather/stations/${station.reference_name}/hourly-reports`,
            }),
          ]),
        }))
      },
    })
  )
  .get("/municipalities/:id/cadastre*", async (cxt: Context) => {
    const readMunicipalityResult = await MunicipalityTable(cxt.db).read(cxt.params.id)

    const filteredMunicipalityResult = readMunicipalityResult
      .flatMap(MunicipalityFilters.hasGeolocation)
      .mapErr((e) => new BadRequest(e.message))

    const listParcelsResult = await filteredMunicipalityResult.flatMapAsync(
      (municipality) =>
        ParcelTable(cxt.db)
          .select()
          .where("shape", "ST_WITHIN", municipality.city_shape)
          .run()
    )

    const prefixLabel = cxt.t("geographical_references_cadastral_parcel_section_prefix")
    const sectionLabel = cxt.t("geographical_references_cadastral_parcel_section")
    const numberLabel = cxt.t("geographical_references_cadastral_parcel_work_number")
    const areaLabel = cxt.t("geographical_references_cadastral_parcel_area")

    const geojson = listParcelsResult.unwrapOr([]).map((parcel) => ({
      ...parcel.shape,
      properties: {
        prefix: parcel.section_prefix,
        section: parcel.section,
        number: parcel.work_number,
        area: parcel.net_surface_area,
        href: `/geographical-references/cadastral-parcels/${parcel.id}`,
        html: `<span><b>${prefixLabel}</b> ${parcel.section_prefix}</span> 
            <br/>
            <span><b>${sectionLabel}</b> ${parcel.section}</span>  
            <br/>
            <span><b>${numberLabel}</b> ${parcel.work_number}</span>
            <br/>
            <span><b>${areaLabel}</b> ${parcel.net_surface_area} m²</span>
            <br/>
            <a href="/geographical-references/cadastral-parcels/${parcel.id}">${cxt.t(
          "common_see"
        )}</a>
            `,
      },
    }))

    return filteredMunicipalityResult
      .map((municipality) => municipality.city_centroid)
      .map(pointToCoordinates)
      .map((center) =>
        generateMapSection({
          output: cxt.output,
          center: center,
          markers: [],
          shapes: geojson,
        })
      ).val
  })
  .get("/municipalities/:id/cap-parcels*", async (cxt: Context) => {
    const readMunicipalityResult = await MunicipalityTable(cxt.db).read(cxt.params.id)

    const filteredMunicipalityResult = readMunicipalityResult
      .flatMap(MunicipalityFilters.hasGeolocation)
      .mapErr((e) => new BadRequest(e.message))

    const listParcelsResult = await filteredMunicipalityResult.flatMapAsync(
      (municipality) =>
        CapParcelTable(cxt.db)
          .select()
          .where("shape", "ST_WITHIN", municipality.city_shape)
          .run()
    )

    const geojson = listParcelsResult.unwrapOr([]).map((parcel) => ({
      ...parcel.shape,
      properties: {
        href: `/geographical-references/cap-parcels/${parcel.id}`,
        html: `<span>${parcel.cap_label}</span> 
            <br/>
            <a href="/geographical-references/cap-parcels/${parcel.id}">${cxt.t(
          "common_see"
        )}</a>
            `,
      },
    }))

    return filteredMunicipalityResult
      .map((municipality) => municipality.city_centroid)
      .map(pointToCoordinates)
      .map((center) =>
        generateMapSection({
          output: cxt.output,
          center: center,
          markers: [],
          shapes: geojson,
        })
      ).val
  })
