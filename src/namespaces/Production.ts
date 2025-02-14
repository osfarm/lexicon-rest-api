import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage, type Context } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { ObjectFlatMap } from "../utils"
import { AutoList } from "../templates/AutoList"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"

interface Production {
  reference_name: string
  activity_family: string
  specie: string
  usage?: string
  agroedi_crop_code?: string
  registration_date?: Date
  translation_id: string
}

const ProductionTable = Table<Production>({
  table: "master_productions",
  primaryKey: "reference_name",
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

export const Production = new Elysia({ prefix: "/production" })
  .get("/", ({ t }: Context) =>
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
    })
  )
  .get("/productions*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("productions_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ProductionTable(cxt.db).select().orderBy("reference_name", "ASC"),
      columns: {
        reference_name: cxt.t("id"),
        activity_family: cxt.t("activity_family"),
        specie: cxt.t("specie"),
        usage: cxt.t("usage"),
      },
      form: {
        name: Field.Text({
          label: cxt.t("activity_family"),
          required: false,
        }),
      },
      formHandler: (input, query) => {
        if (input.name) {
          query.where("activity_family", "LIKE", "%" + input.name + "%")
        }
      },
      handler: (resource) => ({
        reference_name: Hypermedia.Text({
          label: cxt.t("reference_name"),
          value: resource.reference_name,
        }),
        activity_family: Hypermedia.Text({
          label: cxt.t("activity_family"),
          value: resource.activity_family,
        }),
        specie: Hypermedia.Text({
          label: cxt.t("specie"),
          value: resource.specie,
        }),
        usage: resource.usage ? Hypermedia.Text({
          label: cxt.t("usage"),
          value:  resource.usage,
        }) : undefined,
      }),
      credits: CreditTable(cxt.db)
        .select()
        .where("datasource", "=", "productions"),
    }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        name: t.Optional(t.String()),
      }),
    }
  )
