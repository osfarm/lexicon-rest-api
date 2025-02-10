import Elysia, { t } from "elysia"
import { Table } from "../Database"
import { generateTablePage, type Context } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { ObjectFlatMap } from "../utils"
import { AutoList } from "../templates/AutoList"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"

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
    value: t("seed_title"),
    method: "GET",
    href: "/seed",
  }),
]

export const Seed = new Elysia({ prefix: "/seed" })
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("seed_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("variety_title"),
            method: "GET",
            href: "/seed/varieties",
          }),
        ],
      },
    })
  )
  .get("/varieties*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("variety_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: VarietyTable(cxt.db).select().orderBy("id", "ASC"),
      columns: {
        id: cxt.t("id"),
        id_specie: cxt.t("id_specie"),
        specie_name_fra: cxt.t("specie"),
        variety_name: cxt.t("variety"),
        registration_date: cxt.t("registration_date"),
      },
      handler: (resource) => ({
        id: Hypermedia.Text({
          label: cxt.t("id"),
          value: resource.id,
        }),
        id_specie: Hypermedia.Text({
          label: cxt.t("id_specie"),
          value: resource.id_specie,
        }),
        specie_name_fra: Hypermedia.Text({
          label: cxt.t("specie"),
          value: resource.specie_name_fra,
        }),
        variety_name: Hypermedia.Text({
          label: cxt.t("variety"),
          value: resource.variety_name,
        }),
        registration_date: resource.registration_date
                    ? Hypermedia.Date({
                        label: cxt.t("registration_date"),
                        value: cxt.dateTimeFormatter.Date(resource.registration_date),
                        iso: resource.registration_date.toISOString()
                      })
                    : undefined,
      }),
      credits: CreditTable(cxt.db)
        .select()
        .where("datasource", "=", "seed_varieties"),
    })
  )
