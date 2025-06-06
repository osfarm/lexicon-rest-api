import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { ObjectFlatMap } from "../utils"
import { AutoList } from "../templates/views/AutoList"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"
import { API } from "../API"

interface Cropset {
  id: string
  name: string
  label: Record<string, string>
  crop_names: string[]
  crop_labels: { fra: string }
}

const CroptsetTable = Table<Cropset>({
  table: "registered_phytosanitary_cropsets",
  primaryKey: "id",
})

interface Product {
  id: number
  reference_name: string
  name: string
  other_names: string[]
  state: ProductState
  natures: string[]
  active_compounds: string[]
  france_maaid: string
  mix_category_code: string
  in_field_reentry_delay: unknown
  started_on: Date
  stopped_on?: Date
  allowed_mentions?: unknown
  restricted_mentions?: unknown
  operator_protection_mentions: string
  firm_name: string
  product_type: ProductType
}

export enum ProductState {
  INHERITED = "inherited",
  WITHDRAWN = "withdrawn",
  AUTHORIZED = "authorized",
}

export enum ProductType {
  PPP = "PPP",
  PCP = "PCP",
  ADJUVANT = "ADJUVANT",
}

const ProductTable = Table<Product>({
  table: "registered_phytosanitary_products",
  primaryKey: "id",
})

type Risk = {
  id: number
  risk_code: string
  risk_phrase: string
}

const RiskTable = Table<Risk>({
  table: "registered_phytosanitary_risks",
  primaryKey: "id",
})

interface Symbol {
  id: string
  symbol_name: string
}

const SymbolTable = Table<Symbol>({
  table: "registered_phytosanitary_symbols",
  primaryKey: "id",
})

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("phytosanitary_title"),
    method: "GET",
    href: "/phytosanitary",
  }),
]

export const Phytosanitary = API.new()
  .path("/phytosanitary", ({ t }) =>
    AutoList({
      page: {
        title: t("phytosanitary_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("phytosanitary_cropset_title"),
            method: "GET",
            href: "/phytosanitary/cropsets",
          }),
          Hypermedia.Link({
            value: t("phytosanitary_product_title"),
            method: "GET",
            href: "/phytosanitary/products",
          }),
          Hypermedia.Link({
            value: t("phytosanitary_symbol_title"),
            method: "GET",
            href: "/phytosanitary/symbols",
          }),
        ],
      },
      t,
    }),
  )
  .path("/phytosanitary/cropsets", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("phytosanitary_cropset_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: CroptsetTable(cxt.db).select().orderBy("id", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        crops: cxt.t("phytosanitary_cropset_crops"),
      },
      handler: (cropset) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: cropset.label.fra,
        }),
        crops: HypermediaList({
          label: cxt.t("phytosanitary_cropset_crops"),
          values: cropset.crop_labels.fra.split(", "),
        }),
      }),
    }),
  )
  .path("/phytosanitary/products", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("phytosanitary_product_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      form: {
        type: Field.Select({
          label: cxt.t("common_fields_type"),
          options: ObjectFlatMap(ProductType, (_, value) => ({
            [value]: value,
          })),
          required: false,
        }),
        state: Field.Select({
          label: cxt.t("common_fields_state"),
          options: ObjectFlatMap(ProductState, (_, value) => ({
            [value]: cxt.t("pytosanitary_product_state_" + value),
          })),
          required: false,
        }),
      },
      formHandler: (input, query) => {
        if (input.type) {
          query.where("product_type", "=", input.type)
        }
        if (input.state) {
          query.where("state", "=", input.state)
        }
      },

      query: ProductTable(cxt.db).select().orderBy("name", "ASC"),

      columns: {
        name: cxt.t("common_fields_name"),
        firm: cxt.t("pytosanitary_product_firm"),
        type: cxt.t("common_fields_type"),
        "active-compounds": cxt.t("phytosanitary_product_active_compounds"),
        state: cxt.t("pytosanitary_product_state"),
      },
      handler: (product) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: product.name,
        }),
        firm: Hypermedia.Text({
          label: cxt.t("phytosanitary_product_firm"),
          value: product.firm_name,
        }),
        type: Hypermedia.Text({
          label: cxt.t("common_fields_type"),
          value: product.product_type,
        }),
        "active-compounds": HypermediaList({
          label: cxt.t("phytosanitary_product_active_compounds"),
          values: product.active_compounds,
        }),
        state: Hypermedia.Text({
          label: cxt.t("pytosanitary_product_state"),
          value: cxt.t("pytosanitary_product_state_" + product.state),
        }),
      }),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "phytosanitary"),
    }),
  )
  .path("/phytosanitary/symbols", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("phytosanitary_symbol_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: SymbolTable(cxt.db).select().orderBy("id", "ASC"),
      columns: {
        code: cxt.t("phytosanitary_symbol_code"),
        name: cxt.t("common_fields_name"),
      },
      handler: (symbol) => ({
        code: Hypermedia.Text({
          label: cxt.t("phytosanitary_symbol_code"),
          value: symbol.id,
        }),
        name: symbol.symbol_name
          ? Hypermedia.Text({
              label: cxt.t("common_fields_name"),
              value: symbol.symbol_name,
            })
          : undefined,
      }),
    }),
  )
