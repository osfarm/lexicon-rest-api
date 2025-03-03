import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { AutoList } from "../templates/views/AutoList"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"
import { ObjectFlatMap } from "../utils"
import { API } from "../API"

interface Production {
  reference_name: string
  activity_family: ActivityFamily
  specie: string
  usage?: ProductionUsage
  agroedi_crop_code?: string
  registration_date?: Date
  translation_id: string
  // Translation table fields
  id: string
  fra: string
  eng: string
}

export enum ActivityFamily {
  ADMINISTERING = "administering",
  PLANT_FARMING = "plant_farming",
  ANIMAL_FARMING = "animal_farming",
  SERVICE_DELIVERING = "service_delivering",
  TOOL_MAINTAINING = "tool_maintaining",
  PROCESSING = "processing",
  VINE_FARMING = "vine_farming",
  WINE_MAKING = "wine_making",
}

export enum ProductionUsage {
  FODDER = "fodder",
  FRUIT = "fruit",
  PLANT = "plant",
  GRAIN = "grain",
  VEGETABLE = "vegetable",
  FLOWER = "flower",
  MEAT = "meat",
  MEADOW = "meadow",
  MILK = "milk",
  SEED = "seed",
}

const ProductionTable = Table<Production>({
  table: "master_productions",
  primaryKey: "reference_name",
  oneToOne: {
    translation_id: { table: "master_translations", primaryKey: "id" },
  },
})

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("production_title"),
    method: "GET",
    href: "/production",
  }),
]

export const Production = API.new()
  .path("/production", ({ t }) =>
    AutoList({
      page: {
        title: t("production_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("productions_title"),
            method: "GET",
            href: "/production/productions",
          }),
        ],
      },
      t,
    }),
  )
  .path("/production/productions", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("productions_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ProductionTable(cxt.db).select().orderBy("reference_name", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        family: cxt.t("activity_family"),
        usage: cxt.t("usage"),
      },
      form: {
        family: Field.Select({
          label: cxt.t("activity_family"),
          required: false,
          options: ObjectFlatMap(ActivityFamily, (_, val) => ({
            [val]: cxt.t("productions_family_" + val),
          })),
        }),
        usage: Field.Select({
          label: cxt.t("usage"),
          required: false,
          options: ObjectFlatMap(ProductionUsage, (_, val) => ({
            [val]: cxt.t("productions_usage_" + val),
          })),
        }),
      },
      formHandler: (input, query) => {
        if (input.family) {
          query.where("activity_family", "=", input.family)
        }
        if (input.usage) {
          query.where("usage", "=", input.usage)
        }
      },
      handler: (resource) => ({
        name: Hypermedia.Text({
          label: cxt.t("reference_name"),
          value: resource.fra,
        }),
        family: Hypermedia.Text({
          label: cxt.t("activity_family"),
          value: cxt.t("productions_family_" + resource.activity_family),
        }),
        usage: resource.usage
          ? Hypermedia.Text({
              label: cxt.t("usage"),
              value: cxt.t("productions_usage_" + resource.usage),
            })
          : undefined,
      }),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "productions"),
    }),
  )
