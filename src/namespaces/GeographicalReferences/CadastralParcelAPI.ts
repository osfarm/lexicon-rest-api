import Elysia, { t } from "elysia"
import { generateTablePage } from "../../page-generators/generateTablePage"
import type { Context } from "../../types/Context"
import { ParcelTable } from "./CadastralParcel"
import { CreditTable } from "../Credits"
import { Field } from "../../templates/components/Form"
import { Hypermedia } from "../../Hypermedia"
import { MunicipalityTable } from "./Municipality"
import { pointToCoordinates } from "../../types/Coordinates"
import { generateMapSection } from "../../page-generators/generateMapSection"
import type { Translator } from "../../Translator"
import { generateResourcePage } from "../../page-generators/generateResourcePage"

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

export const CadastralParcelAPI = new Elysia()
  .get(
    "/cadastral-parcels*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("geographical_references_cadastral_parcel_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        query: ParcelTable(cxt.db).select(),
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
  .get("/cadastral-parcels/:id", async (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_cadastral_parcel_title"),
          method: "GET",
          href: "/geographical-references/cadastral-parcels",
        }),
      ],
      handler: async () => {
        const [id] = cxt.params.id.split(".")

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

        return readParcelResult.map((parcel) => ({
          title:
            parcel.town_insee_code +
            parcel.section_prefix +
            parcel.section +
            parcel.work_number,

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
      },
    })
  )
  .get("/cadastral-parcels/:id/geolocation*", async (cxt: Context) => {
    const readParcelResult = await ParcelTable(cxt.db).read(cxt.params.id)

    return readParcelResult
      .map((parcel) => ({
        center: pointToCoordinates(parcel.centroid),
        shapes: [parcel.shape],
      }))
      .map(({ center, shapes }) =>
        generateMapSection({ output: cxt.output, center, markers: [center], shapes })
      ).val
  })
