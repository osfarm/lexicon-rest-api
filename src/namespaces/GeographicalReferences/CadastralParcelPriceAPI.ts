import { generateTablePage } from "../../page-generators/generateTablePage"
import { ParcelPriceTable } from "./CadastralParcelPrice"
import { CreditTable } from "../Credits"
import { Field } from "../../templates/components/Form"
import { Hypermedia } from "../../Hypermedia"
import { MunicipalityTable } from "./Municipality"
import { pointToCoordinates } from "../../types/Coordinates"
import { generateMapSection } from "../../page-generators/generateMapSection"
import type { Translator } from "../../Translator"
import { generateResourcePage } from "../../page-generators/generateResourcePage"
import { API } from "../../API"

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

export const CadastralParcelPriceAPI = API.new()
  .path("/geographical-references/cadastral-parcel-prices", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("geographical_references_cadastral_parcel_price_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ParcelPriceTable(cxt.db).select().orderBy("id", "ASC"),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "cadastral_prices"),
      form: {
        postal_code: Field.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_postal_code"),
          required: false,
        }),
        city: Field.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_city"),
          required: false,
        }),
        department: Field.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_department"),
          required: false,
        }),
      },
      formHandler: (input, query) => {
        if (input.postal_code) {
          query.where("postal_code", "=", input.postal_code).orderBy("city", "ASC")
        }
        if (input.city) {
          query.where("city", "LIKE", input.city)
        }
        if (input.department) {
          query.where("department", "=", input.department).orderBy("postal_code", "ASC").orderBy("city", "ASC")
        }
      },
      columns: {
        id: cxt.t("geographical_references_cadastral_parcel_price_id"),
        cadastral_parcel: cxt.t("geographical_references_cadastral_parcel_price_cadastral_parcel"),
        mutation_id: cxt.t("geographical_references_cadastral_parcel_price_mutation_id"),
        building_nature: cxt.t("geographical_references_cadastral_parcel_price_building_nature"),
        mutation_date: cxt.t("geographical_references_cadastral_parcel_price_mutation_date"),
        cadastral_price: cxt.t("geographical_references_cadastral_parcel_price_cadastral_price"),
        postal_code: cxt.t("geographical_references_cadastral_parcel_price_postal_code"),
        city: cxt.t("geographical_references_cadastral_parcel_price_city"),
      },
      handler: (parcel) => ({
        id: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_id"),
          value: parcel.id,
        }),
        cadastral_parcel: Hypermedia.Link({
          value: parcel.cadastral_parcel_id,
          method: "GET",
          href: "/geographical-references/cadastral-parcels/" + parcel.cadastral_parcel_id,
        }),
        mutation_id: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_mutation_id"),
          value: parcel.mutation_id,
        }),
        building_nature: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_building_nature"),
          value: parcel.building_nature,
        }),
        mutation_date: Hypermedia.Date({
          label: cxt.t("geographical_references_cadastral_parcel_price_mutation_date"),
          value: cxt.dateTimeFormatter.Date(parcel.mutation_date),
          iso: parcel.mutation_date.toISOString(),
        }),
        cadastral_price: Hypermedia.Number({
          label: cxt.t("geographical_references_cadastral_parcel_price_cadastral_price"),
          value: parcel.cadastral_price,
          unit: "€",
        }),
        postal_code: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_postal_code"),
          value: parcel.postal_code,
        }),
        city: Hypermedia.Text({
          label: cxt.t("geographical_references_cadastral_parcel_price_city"),
          value: parcel.city,
        }),
      }),
    }),
  )
  .path("/geographical-references/cadastral-parcel-prices/:id", async (cxt) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_cadastral_parcel_price_title"),
          method: "GET",
          href: "/geographical-references/cadastral-parcel-prices",
        }),
      ],
      handler: async (id) => {
        const readParcelPriceResult = await ParcelPriceTable(cxt.db).read(id)

        const searchMunicipalitiesResult = await readParcelPriceResult.flatMapAsync((parcel) =>
          MunicipalityTable(cxt.db)
            .select()
            .where("postal_code", "=", parcel.postal_code)
            .limit(1)
            .run(),
        )

        const associatedMunicipality = searchMunicipalitiesResult
          .toMaybe()
          .filter((municipalities) => municipalities.length > 0)
          .map((municipalities) => municipalities[0])
          .unwrapOr(undefined)

        return readParcelPriceResult.map((parcel) => ({
          title: parcel.mutation_id,
          details: {
            city: associatedMunicipality
              ? Hypermedia.Link({
                  label: cxt.t("common_fields_city"),
                  value: associatedMunicipality.city_name,
                  method: "GET",
                  href: `/geographical-references/municipalities/${associatedMunicipality.id}`,
                })
              : undefined,
            cadastral_price: Hypermedia.Number({
              label: cxt.t("geographical_references_cadastral_parcel_price_cadastral_price"),
              value: parcel.cadastral_price,
              unit: "€",
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
    }),
  )
