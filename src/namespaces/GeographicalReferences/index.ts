import Elysia, { t } from "elysia"
import { Table } from "../../Database"
import { generateTablePage } from "../../page-generators/generateTablePage"
import { Hypermedia } from "../../Hypermedia"
import { AutoList } from "../../templates/views/AutoList"
import { Field } from "../../templates/components/Form"
import type { Translator } from "../../Translator"
import type { Context } from "../../types/Context"
import { MunicipalityAPI } from "./MunicipalityAPI"
import { CadastralParcelAPI } from "./CadastralParcelAPI"

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
  .use(MunicipalityAPI)
  .use(CadastralParcelAPI)
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
