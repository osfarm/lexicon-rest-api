import { Err, Ok } from "shulk"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { AutoList } from "../templates/views/AutoList"
import { generateTablePage } from "../page-generators/generateTablePage"
import { generateResourcePage } from "../page-generators/generateResourcePage"
import { API } from "../API"
import { EnterpriseTable, fetchSubsidiesBySiren } from "./Enterprise"
import { CreditTable } from "./Credits"
import { NotFound } from "../types/HTTPErrors"
import type { Context } from "../types/Context"
import type { Translator } from "../Translator"

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("enterprises_title"),
    method: "GET",
    href: "/enterprises",
  }),
]

export const Enterprises = API.new()
  .path("/enterprises", ({ t }) =>
    AutoList({
      page: {
        title: t("enterprises_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("enterprises_agricultural_title"),
            method: "GET",
            href: "/enterprises/enterprises",
          }),
        ],
      },
      t,
    }),
  )
  .path("/enterprises/enterprises", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("enterprises_agricultural_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      form: {
        name: Field.Text({
          label: cxt.t("common_fields_name"),
          required: false,
        }),
        siren: Field.Text({
          label: cxt.t("tools_enterprise_siren"),
          required: false,
        }),
        city: Field.Text({
          label: cxt.t("common_fields_city"),
          required: false,
        }),
        code: Field.Text({
          label: cxt.t("enterprises_activity_code_prefix"),
          required: false,
          defaultValue: "01",
        }),
      },
      formHandler: (input, query) => {
        if (input.name) {
          query.where("name", "ILIKE", `%${input.name}%`)
        }
        if (input.siren) {
          query.where("siren", "=", input.siren)
        }
        if (input.city) {
          query.where("city", "ILIKE", `%${input.city}%`)
        }
        if (input.code) {
          query.where("french_main_activity_code", "LIKE", `${input.code}%`)
        }
      },
      query: EnterpriseTable(cxt.db)
        .select(
          "establishment_number",
          "siren",
          "name",
          "french_main_activity_code",
          "address",
          "postal_code",
          "city",
        )
        .orderBy("name", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        siren: cxt.t("tools_enterprise_siren"),
        siret: cxt.t("enterprises_siret"),
        activity: cxt.t("tools_enterprise_activity_code"),
        city: cxt.t("common_fields_city"),
        details: cxt.t("common_details"),
      },
      handler: (enterprise) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: enterprise.name ?? "",
        }),
        siren: enterprise.siren
          ? Hypermedia.Link({
              label: cxt.t("tools_enterprise_siren"),
              value: enterprise.siren,
              method: "GET",
              href: "/enterprises/enterprises/" + enterprise.siren,
            })
          : undefined,
        siret: Hypermedia.Text({
          label: cxt.t("enterprises_siret"),
          value: enterprise.establishment_number,
        }),
        activity: Hypermedia.Text({
          label: cxt.t("tools_enterprise_activity_code"),
          value: enterprise.french_main_activity_code,
        }),
        city: Hypermedia.Text({
          label: cxt.t("common_fields_city"),
          value: [enterprise.postal_code, enterprise.city].filter(Boolean).join(" "),
        }),
        details: enterprise.siren
          ? Hypermedia.Link({
              label: cxt.t("common_details"),
              value: cxt.t("common_see"),
              method: "GET",
              href: "/enterprises/enterprises/" + enterprise.siren,
            })
          : undefined,
      }),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "enterprises"),
    }),
  )
  .path("/enterprises/enterprises/:siren", (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("enterprises_agricultural_title"),
          method: "GET",
          href: "/enterprises/enterprises",
        }),
      ],
      handler: async (siren) => {
        const listResult = await EnterpriseTable(cxt.db)
          .select()
          .where("siren", "=", siren)
          .orderBy("city", "ASC")
          .run()

        if (listResult._state === "Err") return listResult
        const rows = listResult.val
        if (rows.length === 0) return Err(new NotFound())

        const primary = rows[0]
        const subsidiesResult = await fetchSubsidiesBySiren(cxt.db, [siren])
        const subsidies = subsidiesResult.unwrapOr(new Map()).get(siren) ?? []
        const totalAmount = subsidies.reduce(
          (s, sub) =>
            s +
            parseFloat((sub.feaga_amount as any) ?? "0") +
            parseFloat((sub.feader_amount as any) ?? "0") +
            parseFloat((sub.cofinanced_amount as any) ?? "0"),
          0,
        )
        const latestYear = subsidies.reduce<number | undefined>(
          (max, s) => (max === undefined || s.year > max ? s.year : max),
          undefined,
        )

        const establishments = rows.map((r) =>
          [r.establishment_number, r.address, r.postal_code, r.city]
            .filter(Boolean)
            .join(" — "),
        )

        return Ok({
          title: primary.name ?? siren,
          details: {
            name: Hypermedia.Text({
              label: cxt.t("common_fields_name"),
              value: primary.name ?? "",
            }),
            siren: Hypermedia.Text({
              label: cxt.t("tools_enterprise_siren"),
              value: siren,
            }),
            "activity-code": Hypermedia.Text({
              label: cxt.t("tools_enterprise_activity_code"),
              value: primary.french_main_activity_code,
            }),
            "establishments-count": Hypermedia.Number({
              label: cxt.t("enterprises_establishments_count"),
              value: rows.length,
            }),
            establishments: HypermediaList({
              label: cxt.t("enterprises_establishments"),
              values: establishments,
            }),
            "subsidies-count":
              subsidies.length > 0
                ? Hypermedia.Number({
                    label: cxt.t("tools_subsidies_count"),
                    value: subsidies.length,
                  })
                : undefined,
            "subsidies-total":
              subsidies.length > 0
                ? Hypermedia.Number({
                    label: cxt.t("tools_subsidies_total_amount"),
                    value: Math.round(totalAmount * 100) / 100,
                    unit: "€",
                  })
                : undefined,
            "subsidies-latest-year":
              latestYear !== undefined
                ? Hypermedia.Number({
                    label: cxt.t("tools_subsidies_year"),
                    value: latestYear,
                  })
                : undefined,
          },
          sections: {},
          links: [],
        })
      },
    }),
  )
