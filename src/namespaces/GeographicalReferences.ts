import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia } from "../Hypermedia"
import { AutoList } from "../templates/AutoList"
import { CreditTable } from "./Credits"
import { Country } from "../types/Country"
import { Field } from "../templates/components/Form"
import { ObjectFlatMap } from "../utils"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"
import type { MultiPolygon, Point } from "../types/Geometry"
import { Err, match, Ok } from "shulk"
import { MapPage } from "../templates/MapPage"

interface PostalCode {
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

const PostalCodeTable = Table<PostalCode>({
  table: "registered_postal_codes",
  primaryKey: "id",
  geometry: ["city_centroid", "city_shape"],
})

namespace PostalCodeFilters {
  export function hasGeolocation(postalCode: PostalCode) {
    if (postalCode.city_shape && postalCode.city_centroid) {
      return Ok({
        id: postalCode.id,
        city_name: postalCode.city_name,
        city_centroid: postalCode.city_centroid,
        city_shape: postalCode.city_shape,
      })
    } else {
      return Err(new Error("This city has no geolocation data."))
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
  shape: string
  centroid: string
}

const ParcelTable = Table<Parcel>({
  table: "registered_cadastral_parcels",
  primaryKey: "id",
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
            value: t("geographical_references_postal_code_title"),
            method: "GET",
            href: "/geographical-references/postal-codes",
          }),
        ],
      },
      t,
    })
  )
  .get(
    "/postal-codes*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_postal_code_title"),
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
            label: cxt.t("geographical_references_postal_code_city"),
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
        query: PostalCodeTable(cxt.db)
          .select()
          .orderBy("country", "ASC")
          .orderBy("city_name", "ASC"),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "postal_codes"),
        columns: {
          country: cxt.t("common_fields_country"),
          city: cxt.t("geographical_references_postal_code_city"),
          "city-code": cxt.t("geographical_references_postal_code_city_code"),
          "postal-code": cxt.t("geographical_references_postal_code_code"),
          location: cxt.t("location"),
        },
        handler: (postalCode) => ({
          country: Hypermedia.Text({
            label: cxt.t("common_fields_country"),
            value: cxt.t("country_" + postalCode.country),
          }),
          city: Hypermedia.Text({
            label: cxt.t("geographical_references_postal_code_city"),
            value: postalCode.city_name,
          }),
          "city-code": Hypermedia.Text({
            label: cxt.t("geographical_references_postal_code_city_code"),
            value: postalCode.code,
          }),
          "postal-code": Hypermedia.Text({
            label: cxt.t("geographical_references_postal_code_code"),
            value: postalCode.postal_code,
          }),

          location: PostalCodeFilters.hasGeolocation(postalCode)
            .map((postalCode) =>
              Hypermedia.Link({
                value: cxt.t("open"),
                method: "GET",
                href: `/geographical-references/postal-codes/${postalCode.id}/location`,
              })
            )
            .unwrapOr(undefined),
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
  .get("/postal-codes/:id/location*", async (cxt: Context) => {
    const readPostalCodeResult = await PostalCodeTable(cxt.db).read(cxt.params.id)

    return readPostalCodeResult
      .flatMap(PostalCodeFilters.hasGeolocation)
      .map((postalCode) =>
        match(cxt.output)
          .returnType<any>()
          .case({
            geojson: () => postalCode.city_shape,
            _otherwise: () =>
              MapPage({
                title: postalCode.city_name,
                breadcrumbs: [
                  ...Breadcrumbs(cxt.t),
                  Hypermedia.Link({
                    value: cxt.t("geographical_references_postal_code_title"),
                    method: "GET",
                    href: "/geographical-references/postal-codes",
                  }),
                ],
                map: {
                  center: {
                    latitude: postalCode.city_centroid.coordinates[1],
                    longitude: postalCode.city_centroid.coordinates[0],
                  },
                  markers: [
                    {
                      latitude: postalCode.city_centroid.coordinates[1],
                      longitude: postalCode.city_centroid.coordinates[0],
                    },
                  ],
                  shapes: [postalCode.city_shape],
                },
              }),
          })
      ).val
  })
  .get("/cadastral-parcels*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("geographical_references_cadastral_parcel_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ParcelTable(cxt.db).select().orderBy("town_insee_code", "ASC"),
      // .orderBy("section_prefix", "ASC")
      // .orderBy("section", "ASC")
      // .orderBy("work_number", "ASC"),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "cadastre"),
      columns: {
        "town-insee-code": cxt.t(
          "geographical_references_cadastral_parcel_town_insee_code"
        ),
        "section-prefix": cxt.t(
          "geographical_references_cadastral_parcel_section_prefix"
        ),
        section: cxt.t("geographical_references_cadastral_parcel_section"),
        "work-number": cxt.t("geographical_references_cadastral_parcel_work_number"),
        area: cxt.t("geographical_references_cadastral_parcel_area"),
      },
      handler: (parcel) => ({
        "town-insee-code": Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_town_insee_code"),
          value: parcel.town_insee_code,
        }),
        "section-prefix": Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
          value: parcel.section_prefix,
        }),
        section: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_section"),
          value: parcel.section,
        }),
        "work-number": Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_work_number"),
          value: parcel.work_number,
        }),
        area: Hypermedia.Number({
          label: cxt.t("geographical_references_cadastral_parcel_area"),
          value: parcel.net_surface_area,
          unit: "m²",
        }),
      }),
    })
  )
  .get(
    "/cap-parcels*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_cap_parcel_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        form: {
          city: Field.Text({
            label: cxt.t("common_fields_city"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.city) {
            query.where("city_name", "LIKE", `%${input.city}%`)
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
            label: cxt.t("common_fields_city"),
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
        city: t.Optional(t.String()),
      }),
    }
  )
