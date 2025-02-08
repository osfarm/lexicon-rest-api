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
  registration_date: Date
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
        specie_name_fra: cxt.t("specie"),
        variety_name: cxt.t("variety"),
      },
      handler: (resource) => ({
        id: Hypermedia.Text({
          label: cxt.t("id"),
          value: resource.id,
        }),
        specie_name_fra: Hypermedia.Text({
          label: cxt.t("specie"),
          value: resource.id_specie,
        }),
        variety_name: Hypermedia.Text({
          label: cxt.t("variety"),
          value: resource.variety_name,
        }),
      }),
      credits: CreditTable(cxt.db)
        .select()
        .where("datasource", "=", "seed_varieties"),
    })
  )
