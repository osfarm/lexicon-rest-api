import Elysia from "elysia"
import { Table } from "../Database"
import { Hypermedia } from "../Hypermedia"
import { generateTablePage, type Context } from "../generateTablePage"
import { AutoTable } from "../templates/AutoTable"
import { Ok } from "shulk"
import { AutoList } from "../templates/AutoList"

export interface Credit {
  datasource: string
  name: string
  url: string
  provider: string
  licence?: string
  licence_url: string
  updated_at: Date
}

export const CreditTable = Table<Credit>({
  table: "datasource_credits",
  primaryKey: "datasource",
})

const FONTAWESOME_CREDIT = {
  datasource: "icons",
  name: "Icones",
  url: "https://fontawesome.com",
  provider: "Font Awesome",
  licence: "CC BY 4.0",
  licence_url: "https://creativecommons.org/licenses/by/4.0/",
  updated_at: new Date(),
}

export const Credits = new Elysia({ prefix: "/credits" })
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("credits_title"),
        breadcrumbs: [
          Hypermedia.Link({
            value: t("home_title"),
            method: "GET",
            href: "/",
          }),
        ],
        links: [
          Hypermedia.Link({
            value: t("credits_datasources_title"),
            method: "GET",
            href: "/credits/datasources",
          }),
          Hypermedia.Link({
            value: t("credits_software_title"),
            method: "GET",
            href: "/credits/software",
          }),
        ],
      },
    })
  )
  .get("/datasources*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("credits_datasources_title"),
      breadcrumbs: [
        Hypermedia.Link({
          value: cxt.t("home_title"),
          method: "GET",
          href: "/",
        }),
        Hypermedia.Link({
          value: cxt.t("credits_title"),
          method: "GET",
          href: "/credits",
        }),
      ],
      query: CreditTable(cxt.db).select().orderBy("name", "ASC"),
      columns: {
        dataset: cxt.t("credits_dataset"),
        provider: cxt.t("credits_provider"),
        license: cxt.t("credits_license"),
      },
      handler: (credit) => ({
        dataset: Hypermedia.Text({
          label: cxt.t("credits_dataset"),
          value: credit.name,
        }),
        provider: Hypermedia.Link({
          label: cxt.t("credits_provider"),
          value: credit.provider,
          method: "GET",
          href: credit.url,
        }),
        license: credit.licence
          ? Hypermedia.Link({
              label: cxt.t("credits_license"),
              value: credit.licence,
              method: "GET",
              href: credit.licence_url,
            })
          : undefined,
      }),
    })
  )
  .get("/software", ({ t }: Context) =>
    AutoTable({
      page: Ok({
        title: t("credits_software_title"),
        breadcrumbs: [
          Hypermedia.Link({
            value: t("home_title"),
            method: "GET",
            href: "/",
          }),
          Hypermedia.Link({
            value: t("credits_title"),
            method: "GET",
            href: "/credits",
          }),
        ],
        table: {
          columns: {
            name: t("common_fields_name"),
            license: t("credits_license"),
          },
          rows: [
            {
              name: Hypermedia.Link({
                label: t("common_fields_name"),
                value: FONTAWESOME_CREDIT.provider,
                method: "GET",
                href: FONTAWESOME_CREDIT.url,
              }),
              license: Hypermedia.Link({
                label: t("credits_license"),
                value: FONTAWESOME_CREDIT.licence,
                method: "GET",
                href: FONTAWESOME_CREDIT.licence_url,
              }),
            },
          ],
        },
        navigation: {
          "first-page": undefined,
          "previous-page": undefined,
          "next-page": undefined,
          "last-page": undefined,
        },
        formats: {},
        "items-count": 1,
        "items-total": 1,
        "items-per-page": 1,
        page: 1,
        pages: [],
        "total-pages": 1,
      }),
      t,
    })
  )
