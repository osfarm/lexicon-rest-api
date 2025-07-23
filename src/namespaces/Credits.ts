import { Table } from "../Database"
import { Hypermedia } from "../Hypermedia"
import { generateTablePage } from "../page-generators/generateTablePage"
import { AutoTable } from "../templates/views/AutoTable"
import { Ok } from "shulk"
import { AutoList } from "../templates/views/AutoList"
import type { Context } from "../types/Context"
import { API } from "../API"
import { parse } from "csv-parse/sync"

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

type SoftwareCredit = {
  name: string
  url: string
  license: string
  license_url: string
}

const softwareCreditsCSV = await Bun.file("./src/assets/software-credits.csv").text()

const softwareCredits = parse(softwareCreditsCSV, {
  delimiter: ",",
  columns: true,
  skip_empty_lines: true,
  encoding: "utf8",
}) as never as SoftwareCredit[]

export const Credits = API.new()
  .path("/credits", ({ t }) =>
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
      t,
    }),
  )
  .path("/credits/datasources", async (cxt: Context) =>
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
    }),
  )
  .path("/credits/software", (cxt) =>
    AutoTable({
      page: Ok({
        title: cxt.t("credits_software_title"),
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
        table: {
          columns: {
            name: cxt.t("common_fields_name"),
            license: cxt.t("credits_license"),
          },
          rows: softwareCredits.map((credit) => ({
            name: Hypermedia.Link({
              label: cxt.t("common_fields_name"),
              value: credit.name,
              method: "GET",
              href: credit.url,
            }),
            license: Hypermedia.Link({
              label: cxt.t("credits_license"),
              value: credit.license,
              method: "GET",
              href: credit.license_url,
            }),
          })),
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
      context: cxt,
    }),
  )
