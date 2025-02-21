import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Hypermedia } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { AutoList } from "../templates/views/AutoList"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"

interface Variety {
  id: string
  id_specie: string
  specie_name_fra: string
  variety_name: string
  registration_date?: Date
}

const VarietyTable = Table<Variety>({
  table: "registered_seed_varieties",
  primaryKey: "id",
})

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("seeds_title"),
    method: "GET",
    href: "/seeds",
  }),
]

export const Seeds = new Elysia({ prefix: "/seeds" })
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("seeds_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("seeds_variety_title"),
            method: "GET",
            href: "/seeds/varieties",
          }),
        ],
      },
      t,
    })
  )
  .get(
    "/varieties*",
    async (cxt: Context) =>
      generateTablePage(cxt, {
        title: cxt.t("seeds_variety_title"),
        breadcrumbs: Breadcrumbs(cxt.t),
        query: VarietyTable(cxt.db)
          .select()
          .orderBy("specie_name_fra", "ASC")
          .orderBy("variety_name", "ASC")
          .orderBy("id", "ASC"),
        columns: {
          code: cxt.t("seeds_variety_code"),
          species: cxt.t("species"),
          variety: cxt.t("variety"),
          registration_date: cxt.t("registration_date"),
        },
        form: {
          species: Field.Text({
            label: cxt.t("species"),
            required: false,
          }),
        },
        formHandler: (input, query) => {
          if (input.species) {
            query.where("specie_name_fra", "LIKE", "%" + input.species + "%")
          }
        },
        handler: (resource) => ({
          code: Hypermedia.Text({
            label: cxt.t("seeds_variety_code"),
            value: resource.id,
          }),
          species: Hypermedia.Text({
            label: cxt.t("species"),
            value: resource.specie_name_fra,
          }),
          variety: Hypermedia.Text({
            label: cxt.t("variety"),
            value: resource.variety_name,
          }),
          registration_date: resource.registration_date
            ? Hypermedia.Date({
                label: cxt.t("registration_date"),
                value: cxt.dateTimeFormatter.Date(resource.registration_date),
                iso: resource.registration_date.toISOString(),
              })
            : undefined,
        }),
        credits: CreditTable(cxt.db).select().where("datasource", "=", "seed_varieties"),
      }),
    {
      query: t.Object({
        page: t.Number({ default: 1 }),
        species: t.Optional(t.String()),
      }),
    }
  )
