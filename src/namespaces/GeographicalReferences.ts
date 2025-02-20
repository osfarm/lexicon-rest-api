import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia, hypermedia2json } from "../Hypermedia"
import { AutoList } from "../templates/AutoList"
import { CreditTable } from "./Credits"
import { Country } from "../types/Country"
import { Field } from "../templates/components/Form"
import { ObjectFlatMap } from "../utils"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"
import type { MultiPolygon, Point } from "../types/Geometry"
import { Err, match, Ok, type Result } from "shulk"
import { MapPage } from "../templates/MapPage"
import { ResourcePage } from "../templates/ResourcePage"
import { Map } from "../templates/components/Map"
import { StationTable } from "./Weather"

interface Municipality {
  id: string
  country: Country
  code: string
  city_name: string
  postal_code: string
  city_delivery_name: string
  city_delivery_detail?: string
  city_centroid?: Point
  city_shape?: MultiPolygon
}

const MunicipalityTable = Table<Municipality>({
  table: "registered_postal_codes",
  primaryKey: "id",
  geometry: ["city_centroid", "city_shape"],
})

namespace MunicipalityFilters {
  export function hasGeolocation(municipality: Municipality): Result<
    Error,
    {
      id: string
      city_name: string
      city_centroid: Point
      city_shape: MultiPolygon
    }
  > {
    if (municipality.city_shape && municipality.city_centroid) {
      return Ok({
        id: municipality.id,
        city_name: municipality.city_name,
        city_centroid: municipality.city_centroid,
        city_shape: municipality.city_shape,
      })
    } else {
      return Err(new Error("This municipality has no geolocation data."))
    }
  }
}

interface Parcel {
  id: string
  town_insee_code: string
  section_prefix: string
  section: string
  work_number: string
  net_surface_area: number
  shape: MultiPolygon
  centroid: Point
}

const ParcelTable = Table<Parcel>({
  table: "registered_cadastral_parcels",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})

interface CapParcel {
  id: string
  cap_crop_code: CapCode
  city_name: string
  shape: string
  centroid: string
  cap_code: string
  cap_label: string
  production: string
  cap_precision?: string
  cap_category?: string
  is_seed: boolean
  year: number
}
type CapCode = string

const CapParcelTable = Table<CapParcel>({
  table: "registered_graphic_parcels",
  primaryKey: "id",
  oneToOne: {
    cap_crop_code: {
      table: "master_crop_production_cap_codes",
      primaryKey: "cap_code",
    },
  },
})

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

export const GeographicalReferences = new Elysia({
  prefix: "/geographical-references",
})
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("geographical_references_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("geographical_references_cadastral_parcel_title"),
            method: "GET",
            href: "/geographical-references/cadastral-parcels",
          }),
          Hypermedia.Link({
            value: t("geographical_references_cap_parcel_title"),
            method: "GET",
            href: "/geographical-references/cap-parcels",
          }),
          Hypermedia.Link({
            value: t("geographical_references_municipality_title"),
            method: "GET",
            href: "/geographical-references/municipalities",
          }),
        ],
      },
      t,
    })
  )
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
          if (input.city) {
            query.where("city_name", "LIKE", `%${input.city}%`)
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
  .get("/municipalities/:id", async (cxt: Context) => {
    const [id, output] = cxt.params.id.split(".")

    const readMunicipalityResult = await MunicipalityTable(cxt.db).read(id)

    const searchStationsResult = await readMunicipalityResult.flatMapAsync(
      (municipality) =>
        StationTable(cxt.db)
          .select()
          .where("station_name", "=", municipality.city_name)
          .run()
    )

    const associatedStations = searchStationsResult.unwrapOr([])

    const page = readMunicipalityResult.map((municipality) => ({
      title: municipality.city_name,
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_municipality_title"),
          method: "GET",
          href: "/geographical-references/municipalities",
        }),
      ],
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
        cadastre: Hypermedia.Link({
          value: cxt.t("geographical_references_municipality_cadastre"),
          method: "GET",
          href: `/geographical-references/municipalities/${municipality.id}/cadastral-parcels`,
        }),
      },
      links: associatedStations.map((station) =>
        Hypermedia.Link({
          value:
            cxt.t("geographical_references_municipality_weather_reports") +
            ` (${station.station_name} - ${station.station_code})`,
          method: "GET",
          href: `/weather/stations/${station.reference_name}/hourly-reports`,
        })
      ),
    }))

    return match(output)
      .returnType<any>()
      .case({
        json: () => hypermedia2json(cxt.request, page.val),
        _otherwise: () => ResourcePage({ page, t: cxt.t }),
      })
  })
  .get("/municipalities/:id/cadastral-parcels*", async (cxt: Context) => {
    const readMunicipalityResult = await MunicipalityTable(cxt.db).read(cxt.params.id)

    const filteredMunicipalityResult = readMunicipalityResult.flatMap(
      MunicipalityFilters.hasGeolocation
    )

    const listParcelsResult = await filteredMunicipalityResult.flatMapAsync(
      (municipality) =>
        ParcelTable(cxt.db)
          .select()
          .where("shape", "ST_WITHIN", municipality.city_shape)
          .run()
    )

    const centerLatitude = filteredMunicipalityResult
      .map((municipality) => municipality.city_centroid.coordinates[1])
      .unwrapOr(0)

    const centerLongitude = filteredMunicipalityResult
      .map((municipality) => municipality.city_centroid.coordinates[0])
      .unwrapOr(0)

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

    return match(cxt.output)
      .returnType<any>()
      .case({
        geojson: () => ({
          type: "FeatureCollection",
          features: geojson.map((geometry) => ({ type: "Feature", geometry })),
        }),
        _otherwise: () =>
          Map({
            center: {
              latitude: centerLatitude,
              longitude: centerLongitude,
            },
            markers: [],
            shapes: geojson,
          }),
      })
  })
  .get(
    "/cadastral-parcels*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_cadastral_parcel_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        query: ParcelTable(cxt.db).select().orderBy("town_insee_code", "ASC"),
        // .orderBy("section_prefix", "ASC")
        // .orderBy("section", "ASC")
        // .orderBy("work_number", "ASC"),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "cadastre"),
        form: {
          code: Field.Text({
            label: cxt.t("geographical_references_cadastral_parcel_city_code"),
            required: false,
          }),
          prefix: Field.Text({
            label: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
            required: false,
          }),
          section: Field.Text({
            label: cxt.t("geographical_references_cadastral_parcel_section"),
            required: false,
          }),
          number: Field.Text({
            label: cxt.t("geographical_references_cadastral_parcel_work_number"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.code) {
            query.where("town_insee_code", "=", input.code)
          }
          if (input.prefix) {
            query.where("section_prefix", "=", input.prefix)
          }
          if (input.section) {
            query.where("section", "=", input.section)
          }
          if (input.number) {
            query.where("work_number", "=", input.number)
          }
        },
        columns: {
          code: cxt.t("geographical_references_cadastral_parcel_city_code"),
          prefix: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
          section: cxt.t("geographical_references_cadastral_parcel_section"),
          number: cxt.t("geographical_references_cadastral_parcel_work_number"),
          area: cxt.t("geographical_references_cadastral_parcel_area"),
          details: cxt.t("common_details"),
        },
        handler: (parcel) => ({
          code: Hypermedia.Text({
            label: cxt.t("geographical_references_cadastral_parcel_city_code"),
            value: parcel.town_insee_code,
          }),
          prefix: Hypermedia.Text({
            label: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
            value: parcel.section_prefix,
          }),
          section: Hypermedia.Text({
            label: cxt.t("geographical_references_cadastral_parcel_section"),
            value: parcel.section,
          }),
          number: Hypermedia.Text({
            label: cxt.t("geographical_references_cadastral_parcel_work_number"),
            value: parcel.work_number,
          }),
          area: Hypermedia.Number({
            label: cxt.t("geographical_references_cadastral_parcel_area"),
            value: parcel.net_surface_area,
            unit: "m²",
          }),
          details: Hypermedia.Link({
            value: cxt.t("common_see"),
            method: "GET",
            href: "/geographical-references/cadastral-parcels/" + parcel.id,
          }),
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        code: t.Optional(t.String()),
        prefix: t.Optional(t.String()),
        section: t.Optional(t.String()),
        number: t.Optional(t.String()),
      }),
    }
  )
  .get("/cadastral-parcels/:id", async (cxt: Context) => {
    const [id, output] = cxt.params.id.split(".")

    const readParcelResult = await ParcelTable(cxt.db).read(id)

    const searchMunicipalitiesResult = await readParcelResult.flatMapAsync((parcel) =>
      MunicipalityTable(cxt.db)
        .select()
        .where("code", "=", parcel.town_insee_code)
        .limit(1)
        .run()
    )

    const associatedMunicipality = searchMunicipalitiesResult
      .toMaybe()
      .filter((municipalities) => municipalities.length > 0)
      .map((municipalities) => municipalities[0])
      .unwrapOr(undefined)

    const page = readParcelResult.map((parcel) => ({
      title:
        parcel.town_insee_code +
        parcel.section_prefix +
        parcel.section +
        parcel.work_number,
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_cadastral_parcel_title"),
          method: "GET",
          href: "/geographical-references/cadastral-parcels",
        }),
      ],
      details: {
        city: associatedMunicipality
          ? Hypermedia.Link({
              label: cxt.t("common_fields_city"),
              value: associatedMunicipality.city_name,
              method: "GET",
              href: `/geographical-references/municipalities/${associatedMunicipality.id}`,
            })
          : undefined,
        code: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_city_code"),
          value: parcel.town_insee_code,
        }),
        prefix: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
          value: parcel.section_prefix,
        }),
        section: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_section"),
          value: parcel.section,
        }),
        number: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_work_number"),
          value: parcel.work_number,
        }),
        area: Hypermedia.Number({
          label: cxt.t("geographical_references_cadastral_parcel_area"),
          value: parcel.net_surface_area,
          unit: "m²",
        }),
      },
      sections: {
        geolocation: Hypermedia.Link({
          value: cxt.t("common_location"),
          method: "GET",
          href: `/geographical-references/cadastral-parcels/${id}/geolocation`,
        }),
      },
      links: associatedMunicipality
        ? [
            Hypermedia.Link({
              value: associatedMunicipality.city_name,
              method: "GET",
              href: `/geographical-references/municipalities/${associatedMunicipality.id}`,
            }),
          ]
        : [],
    }))

    return match(output)
      .returnType<any>()
      .case({
        json: () => hypermedia2json(cxt.request, page.val),
        _otherwise: () => ResourcePage({ page, t: cxt.t }),
      })
  })
  .get("/cadastral-parcels/:id/geolocation*", async (cxt: Context) => {
    const readParcelResult = await ParcelTable(cxt.db).read(cxt.params.id)

    const geojson = readParcelResult.map((parcel) => parcel.shape).unwrapOr(undefined)

    return match(cxt.output)
      .returnType<any>()
      .case({
        geojson: () => geojson,
        _otherwise: () =>
          readParcelResult.map((parcel) =>
            Map({
              center: {
                latitude: parcel.centroid.coordinates[1],
                longitude: parcel.centroid.coordinates[0],
              },
              markers: [
                {
                  latitude: parcel.centroid.coordinates[1],
                  longitude: parcel.centroid.coordinates[0],
                },
              ],
              shapes: [parcel.shape],
            })
          ).val,
      })
  })
  .get(
    "/cap-parcels*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_cap_parcel_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        form: {
          municipality: Field.Text({
            label: cxt.t("common_fields_municipality"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.municipality) {
            query.where("city_name", "LIKE", `%${input.municipality}%`)
          }
        },
        query: CapParcelTable(cxt.db).select().orderBy("city_name", "ASC"),
        columns: {
          city: cxt.t("common_fields_city"),
          id: cxt.t("ID"),
          culture: cxt.t("geographical_references_cap_parcel_culture"),
        },
        handler: (parcel) => ({
          city: Hypermedia.Text({
            label: cxt.t("common_fields_municipality"),
            value: parcel.city_name,
          }),
          id: Hypermedia.Text({
            label: cxt.t("ID"),
            value: parcel.id,
          }),
          culture: Hypermedia.Text({
            label: cxt.t("geographical_references_cap_parcel_culture"),
            value: parcel.cap_label,
          }),
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        municipality: t.Optional(t.String()),
      }),
    }
  )
