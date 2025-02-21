import Elysia, { t } from "elysia"
import { Hypermedia } from "../../Hypermedia"
import { generateTablePage } from "../../page-generators/generateTablePage"
import type { Context } from "../../types/Context"
import { Field } from "../../templates/components/Form"
import { CapParcelTable } from "./CapParcel"
import type { Translator } from "../../Translator"
import { generateResourcePage } from "../../page-generators/generateResourcePage"
import { pointToCoordinates } from "../../types/Coordinates"
import { generateMapSection } from "../../page-generators/generateMapSection"

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

export const CapParcelAPI = new Elysia()
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
          //   culture: Field.Text({
          //     label: cxt.t("geographical_references_cap_parcel_culture"),
          //     required: false,
          //   }),
        },
        formHandler: (input, query) => {
          if (input.city) {
            query.where("city_name", "LIKE", `%${input.city}%`)
          }
          if (input.culture) {
            query.where("cap_label", "LIKE", `%${input.culture}%`)
          }
        },
        query: CapParcelTable(cxt.db).select().orderBy("city_name", "ASC"),
        columns: {
          city: cxt.t("common_fields_city"),
          id: cxt.t("ID"),
          culture: cxt.t("geographical_references_cap_parcel_culture"),
          details: cxt.t("common_details"),
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
          details: Hypermedia.Link({
            label: cxt.t("common_details"),
            value: cxt.t("common_see"),
            method: "GET",
            href: "/geographical-references/cap-parcels/" + parcel.id,
          }),
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        city: t.Optional(t.String()),
        culture: t.Optional(t.String()),
      }),
    }
  )
  .get("/cap-parcels/:id", (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_cap_parcel_title"),
          method: "GET",
          href: "/geographical-references/cap-parcels",
        }),
      ],
      handler: async (id) => {
        const readCapParcelResult = await CapParcelTable(cxt.db).read(id)

        return readCapParcelResult.map((parcel) => ({
          title: parcel.id,
          details: {
            id: Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_id"),
              value: parcel.id,
            }),
            "crop-code": Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_crop_code"),
              value: parcel.cap_crop_code,
            }),
            city: Hypermedia.Text({
              label: cxt.t("common_fields_city"),
              value: parcel.city_name,
            }),
            culture: Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_culture"),
              value: parcel.cap_label,
            }),
          },
          sections: {
            geolocation: Hypermedia.Link({
              value: cxt.t("common_location"),
              method: "GET",
              href: `/geographical-references/cap-parcels/${id}/geolocation`,
            }),
          },
          links: [],
        }))
      },
    })
  )
  .get("/cap-parcels/:id/geolocation*", async (cxt: Context) => {
    const readParcelResult = await CapParcelTable(cxt.db).read(cxt.params.id)

    return readParcelResult
      .map((parcel) => ({
        center: pointToCoordinates(parcel.centroid),
        shapes: [parcel.shape],
      }))
      .map(({ center, shapes }) =>
        generateMapSection({ output: cxt.output, center, markers: [center], shapes })
      ).val
  })
