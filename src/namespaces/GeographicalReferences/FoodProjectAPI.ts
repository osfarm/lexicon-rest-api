import { generateTablePage } from "../../page-generators/generateTablePage"
import { Field } from "../../templates/components/Form"
import { CreditTable } from "../Credits"
import { Hypermedia, HypermediaList } from "../../Hypermedia"
import type { Translator } from "../../Translator"
import { API } from "../../API"
import { Table } from "../../Database"
import { isInseeCode } from "../../links/Links"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

interface FoodProjectRow {
  id: number
  name: string
  usual_name: string | null
  sheet_url: string | null
  regions: string | null
  holder: string | null
  holder_kind: string | null
  label_level: number | null
  labelled_in: number | null
  themes: string[]
  communes_count: number
  farms_count: number | null
  organic_farmland_share: string | null
}

const PROJECTS = "registered_territorial_food_projects"

const FoodProjectTable = Table<FoodProjectRow>({ table: PROJECTS, primaryKey: "id" })

// The communes of a project in one text, to find the projects covering a commune:
// codes have five characters and a comma between them, so that one cannot match across two
const COMMUNES_OF_PROJECT = `(SELECT string_agg(c.insee_code, ',') FROM "${DB_SCHEMA}".registered_territorial_food_project_communes c WHERE c.project_id = ${PROJECTS}.id)` as keyof FoodProjectRow

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({
    value: t("geographical_references_title"),
    method: "GET",
    href: "/geographical-references",
  }),
]

export const FoodProjectAPI = API.new().path(
  "/geographical-references/food-projects",
  async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("food_project_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      form: {
        commune: Field.Text({ label: cxt.t("food_project_commune"), required: false }),
        name: Field.Text({ label: cxt.t("common_fields_name"), required: false }),
        level: Field.Select({
          label: cxt.t("food_project_label_level"),
          options: { "1": "1", "2": "2" },
          required: false,
        }),
      },
      formHandler: (input, query) => {
        const commune = String(input.commune ?? "").trim().toUpperCase()

        if (isInseeCode(commune)) {
          query.where(COMMUNES_OF_PROJECT, "LIKE", `%${commune}%`)
        }
        if (input.name) {
          query.where("name", "ILIKE", `%${String(input.name).trim()}%`)
        }
        if (input.level === "1" || input.level === "2") {
          query.where("label_level", "=", Number(input.level))
        }
      },

      query: FoodProjectTable(cxt.db).select().orderBy("name", "ASC"),

      columns: {
        name: cxt.t("common_fields_name"),
        level: cxt.t("food_project_label_level"),
        "labelled-in": cxt.t("food_project_labelled_in"),
        holder: cxt.t("food_project_holder"),
        "holder-kind": cxt.t("food_project_holder_kind"),
        regions: cxt.t("food_project_regions"),
        communes: cxt.t("food_project_communes"),
        farms: cxt.t("food_project_farms"),
        "organic-farmland-share": cxt.t("food_project_organic_share"),
        themes: cxt.t("food_project_themes"),
        sheet: cxt.t("food_project_sheet"),
        id: cxt.t("ID"),
      },
      handler: (project) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: project.usual_name ?? project.name,
        }),
        level:
          project.label_level === null
            ? undefined
            : Hypermedia.Number({
                label: cxt.t("food_project_label_level"),
                value: project.label_level,
              }),
        "labelled-in":
          project.labelled_in === null
            ? undefined
            : Hypermedia.Text({
                label: cxt.t("food_project_labelled_in"),
                value: String(project.labelled_in),
              }),
        holder: project.holder
          ? Hypermedia.Text({ label: cxt.t("food_project_holder"), value: project.holder })
          : undefined,
        "holder-kind": project.holder_kind
          ? Hypermedia.Text({
              label: cxt.t("food_project_holder_kind"),
              value: project.holder_kind,
            })
          : undefined,
        regions: project.regions
          ? Hypermedia.Text({ label: cxt.t("food_project_regions"), value: project.regions })
          : undefined,
        communes: Hypermedia.Number({
          label: cxt.t("food_project_communes"),
          value: project.communes_count,
        }),
        farms:
          project.farms_count === null
            ? undefined
            : Hypermedia.Number({
                label: cxt.t("food_project_farms"),
                value: project.farms_count,
              }),
        "organic-farmland-share":
          project.organic_farmland_share === null
            ? undefined
            : Hypermedia.Number({
                label: cxt.t("food_project_organic_share"),
                value: Number(project.organic_farmland_share),
                unit: "%",
              }),
        themes: HypermediaList({
          label: cxt.t("food_project_themes"),
          values: (project.themes ?? []).map((theme) => cxt.t("food_project_theme_" + theme)),
        }),
        sheet: project.sheet_url
          ? Hypermedia.Link({
              label: cxt.t("food_project_sheet"),
              value: "france-pat.fr",
              method: "GET",
              href: project.sheet_url,
            })
          : undefined,
        id: Hypermedia.Text({ label: cxt.t("ID"), value: String(project.id) }),
      }),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "pat"),
    }),
)
