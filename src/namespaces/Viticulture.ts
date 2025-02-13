import Elysia, { t } from "elysia"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { Table } from "../Database"
import {
  generateTablePage,
  type Context,
} from "../page-generators/generateTablePage"
import { AutoList } from "../templates/AutoList"
import { Field } from "../templates/components/Form"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"

type VineVariety = {
  id: string
  short_name: string
  long_name?: string
  category: VineCategory
  color?: VineColor
  utilities?: string[]
}

enum VineColor {
  BLACK = "black",
  WHITE = "white",
  GREY = "grey",
}

enum VineCategory {
  VARIETY = "variety",
  HYBRID = "hybrid",
  ROOTSTOCK = "rootstock",
}

const VineVarietyTable = Table<VineVariety>({
  table: "registered_vine_varieties",
  primaryKey: "id",
  // map: {
  //   id: "id",
  //   shortName: "short_name",
  //   longName: "long_name",
  //   color: "color",
  //   category: "category",
  //   utilities: "utilities",
  // },
})

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("viticulture_title"),
    method: "GET",
    href: "/viticulture",
  }),
]

export const Viticulture = new Elysia({
  prefix: "/viticulture",
})
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("viticulture_title"),
        breadcrumbs: [
          Hypermedia.Link({
            value: t("home_title"),
            method: "GET",
            href: "/",
          }),
        ],
        links: [
          Hypermedia.Link({
            value: t("viticulture_vine_variety_title"),
            method: "GET",
            href: "/viticulture/vine-varieties",
          }),
        ],
      },
    })
  )
  .get(
    "/vine-varieties*",
    (context: Context) =>
      generateTablePage(context, {
        title: context.t("viticulture_vine_variety_title"),
        breadcrumbs: Breadcrumbs(context.t),
        form: {
          category: Field.Select({
            label: context.t("common_fields_category"),
            options: Object.fromEntries(
              Object.values(VineCategory).map((category) => [
                category,
                context.t("viticulture_vine_variety_category_" + category),
              ])
            ),
            required: false,
          }),
          color: Field.Select({
            label: context.t("common_fields_color"),
            options: Object.fromEntries(
              Object.values(VineColor).map((category) => [
                category,
                context.t("viticulture_vine_variety_color_" + category),
              ])
            ),
            required: false,
          }),
        },
        query: VineVarietyTable(context.db)
          .select()
          .orderBy("short_name", "ASC"),
        credits: CreditTable(context.db)
          .select()
          .where("datasource", "=", "vine_varieties"),
        columns: {
          name: context.t("common_fields_name"),
          category: context.t("common_fields_category"),
          color: context.t("common_fields_color"),
          utilities: context.t("viticulture_vine_variety_utilities"),
        },
        handler: (item) => ({
          name: Hypermedia.Text({
            label: context.t("common_fields_name"),
            value: item.long_name ? item.long_name : item.short_name,
          }),
          category: Hypermedia.Text({
            label: context.t("common_fields_category"),
            value: context.t(
              "viticulture_vine_variety_category_" + item.category
            ),
          }),
          color: item.color
            ? Hypermedia.Text({
                label: context.t("common_fields_color"),
                value: context.t(
                  "viticulture_vine_variety_color_" + item.color
                ),
              })
            : undefined,
          utilities: item.utilities
            ? HypermediaList({
                label: context.t("viticulture_vine_variety_utilities"),
                values: item.utilities.map((utility: string) =>
                  Hypermedia.Text({
                    label: context.t("viticulture_vine_variety_utilities"),
                    value: context.t(
                      "viticulture_vine_variety_utility_" + utility
                    ),
                  })
                ),
              })
            : undefined,
        }),
      }),
    {
      query: t.Object({
        page: t.Number({ minimum: 1, default: 1 }),
        category: t.Optional(t.String({ default: undefined })),
        color: t.Optional(t.String({ default: undefined })),
      }),
    }
  )
