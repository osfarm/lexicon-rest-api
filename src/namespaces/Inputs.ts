import { API } from "../API"
import { MEMBERS_SCOPE } from "../access/Plan"
import { Table } from "../Database"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { generateTablePage } from "../page-generators/generateTablePage"
import { Field } from "../templates/components/Form"
import { AutoList } from "../templates/views/AutoList"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"
import { CreditTable } from "./Credits"

// Farm inputs: what they are made of and what they cost. The reference prices and
// what is drawn from public sources are open. The readings made at merchants, which
// name who sells what and where, are reserved to members.

type Row = Record<string, any>
type Kind = "text" | "number" | "date" | "boolean" | "list" | "month"
// Column of the table: the field it shows, how to show it, and a unit for a number
type Column = [field: string, kind: Kind, unit?: string | ((row: Row) => string)]

type Resource = Readonly<{
  path: string
  table: string
  primaryKey: string
  datasource: string
  order: [string, "ASC" | "DESC"][]
  columns: Column[]
  // Fields that can be filtered on: an exact value, or a part of a text
  filters?: [field: string, how: "is" | "holds"][]
}>

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: t("inputs_title"), method: "GET", href: "/inputs" }),
]

const PER_UNIT = (row: Row) => `€ / ${row.unit}`

const OPEN: Resource[] = [
  {
    path: "/inputs/article-prices",
    table: "master_prices",
    primaryKey: "id",
    datasource: "prices",
    order: [
      ["reference_article_name", "ASC"],
      ["started_on", "DESC"],
    ],
    columns: [
      ["reference_article_name", "text"],
      ["unit_pretax_amount", "number", (row) => `€ / ${row.reference_packaging_name}`],
      ["started_on", "date"],
      ["id", "text"],
    ],
    filters: [["reference_article_name", "holds"]],
  },
  {
    path: "/inputs/phytosanitary-prices",
    table: "master_phytosanitary_prices",
    primaryKey: "id",
    datasource: "prices",
    order: [
      ["reference_article_name", "ASC"],
      ["started_on", "DESC"],
    ],
    columns: [
      ["reference_article_name", "number"],
      ["unit_pretax_amount", "number", (row) => `€ / ${row.reference_packaging_name}`],
      ["started_on", "date"],
      ["id", "text"],
    ],
    filters: [["reference_article_name", "is"]],
  },
  {
    path: "/inputs/price-sources",
    table: "master_price_sources",
    primaryKey: "id",
    datasource: "prices",
    order: [["id", "ASC"]],
    columns: [
      ["id", "text"],
      ["price_table", "text"],
      ["method", "text"],
      ["source", "text"],
      ["negotiated", "boolean"],
      ["previous_amount", "number"],
      ["previous_started_on", "date"],
      ["detail", "text"],
    ],
    filters: [
      ["method", "is"],
      ["source", "is"],
    ],
  },
  {
    path: "/inputs/fuel-prices",
    table: "registered_fuel_monthly_prices",
    primaryKey: "id",
    datasource: "fuel_prices",
    order: [["month", "DESC"]],
    columns: [
      ["product", "text"],
      ["month", "month"],
      ["price_excluding_vat", "number", PER_UNIT],
      ["price_excluding_taxes", "number", PER_UNIT],
      ["price_including_taxes", "number", PER_UNIT],
      ["observations", "number"],
      ["last_observed_on", "date"],
    ],
    filters: [["product", "is"]],
  },
  {
    path: "/inputs/phytosanitary-substances",
    table: "registered_phytosanitary_substances",
    primaryKey: "id",
    datasource: "phytosanitary_substances",
    order: [["name", "ASC"]],
    columns: [
      ["name", "text"],
      ["cas_number", "text"],
      ["approval_state", "text"],
      ["eiq", "number"],
      ["eiq_farm_worker", "number"],
      ["eiq_consumer", "number"],
      ["eiq_ecological", "number"],
      ["eiq_match", "text"],
      ["hrac_group", "text"],
      ["hrac_mode_of_action", "text"],
      ["hrac_match", "text"],
      ["french_names", "list"],
      ["id", "text"],
    ],
    filters: [
      ["name", "holds"],
      ["hrac_group", "is"],
    ],
  },
  {
    path: "/inputs/phytosanitary-product-substances",
    table: "registered_phytosanitary_product_substances",
    primaryKey: "id",
    datasource: "phytosanitary_substances",
    order: [
      ["product_id", "ASC"],
      ["substance_id", "ASC"],
    ],
    columns: [
      ["product_id", "number"],
      ["substance_id", "text"],
      ["quantity", "number", (row) => row.unit ?? ""],
      ["french_name", "text"],
    ],
    filters: [
      ["product_id", "is"],
      ["substance_id", "is"],
    ],
  },
]

const RESERVED: Resource[] = [
  {
    path: "/inputs/fertilizers",
    table: "registered_fertilizers",
    primaryKey: "id",
    datasource: "fertilizers",
    order: [["name", "ASC"]],
    columns: [
      ["name", "text"],
      ["kind", "text"],
      ["nitrogen", "number", "%"],
      ["phosphorus", "number", "%"],
      ["potassium", "number", "%"],
      ["sulfur", "number", "%"],
      ["magnesium", "number", "%"],
      ["calcium", "number", "%"],
      ["variant_reference_name", "text"],
      ["merchants", "list"],
      ["id", "text"],
    ],
    filters: [
      ["name", "holds"],
      ["kind", "is"],
    ],
  },
  {
    path: "/inputs/fertilizer-prices",
    table: "registered_fertilizer_monthly_prices",
    primaryKey: "id",
    datasource: "fertilizers",
    order: [
      ["month", "DESC"],
      ["fertilizer_id", "ASC"],
    ],
    columns: [
      ["fertilizer_id", "text"],
      ["packaging", "text"],
      ["month", "month"],
      ["price", "number", PER_UNIT],
      ["merchant", "text"],
      ["negotiated", "boolean"],
      ["observations", "number"],
      ["last_observed_on", "date"],
    ],
    filters: [["fertilizer_id", "is"]],
  },
  {
    path: "/inputs/fertilizer-unit-values",
    table: "registered_fertilizer_unit_values",
    primaryKey: "id",
    datasource: "fertilizers",
    order: [
      ["month", "DESC"],
      ["nutrient", "ASC"],
    ],
    columns: [
      ["nutrient", "text"],
      ["month", "month"],
      ["value", "number", "€ / kg"],
      ["fertilizer_id", "text"],
      ["packaging", "text"],
      ["price", "number", "€ / ton"],
      ["merchant", "text"],
    ],
    filters: [["nutrient", "is"]],
  },
  {
    path: "/inputs/fertilizer-price-readings",
    table: "registered_fertilizer_price_readings",
    primaryKey: "id",
    datasource: "fertilizers",
    order: [
      ["observed_on", "DESC"],
      ["fertilizer_id", "ASC"],
    ],
    columns: [
      ["fertilizer_id", "text"],
      ["source_label", "text"],
      ["merchant", "text"],
      ["delivery_postal_code", "text"],
      ["packaging", "text"],
      ["price", "number", PER_UNIT],
      ["observed_on", "date"],
      ["delivery_from", "date"],
      ["delivery_to", "date"],
      ["negotiated", "boolean"],
    ],
    filters: [
      ["fertilizer_id", "is"],
      ["merchant", "is"],
      ["delivery_postal_code", "is"],
    ],
  },
  {
    path: "/inputs/seed-species",
    table: "registered_seed_species",
    primaryKey: "id",
    datasource: "seeds",
    order: [["name", "ASC"]],
    columns: [
      ["name", "text"],
      ["latin_name", "text"],
      ["family", "text"],
      ["category", "text"],
      ["season", "text"],
      ["sowing_rate_min", "number", "kg / ha"],
      ["sowing_rate_max", "number", "kg / ha"],
      ["taxon_reference_name", "text"],
      ["id", "text"],
    ],
    filters: [
      ["name", "holds"],
      ["category", "is"],
    ],
  },
  {
    path: "/inputs/seed-prices",
    table: "registered_seed_monthly_prices",
    primaryKey: "id",
    datasource: "seeds",
    order: [
      ["month", "DESC"],
      ["species_id", "ASC"],
    ],
    columns: [
      ["species_id", "text"],
      ["organic", "boolean"],
      ["month", "month"],
      ["price_per_kilogram", "number", "€ / kg"],
      ["lowest_price_per_kilogram", "number", "€ / kg"],
      ["highest_price_per_kilogram", "number", "€ / kg"],
      ["offers", "number"],
      ["merchants", "list"],
    ],
    filters: [["species_id", "is"]],
  },
  {
    path: "/inputs/seed-price-readings",
    table: "registered_seed_price_readings",
    primaryKey: "id",
    datasource: "seeds",
    order: [
      ["observed_on", "DESC"],
      ["label", "ASC"],
    ],
    columns: [
      ["label", "text"],
      ["species_id", "text"],
      ["variety", "text"],
      ["variety_id", "text"],
      ["merchant", "text"],
      ["organic", "boolean"],
      ["mixture", "boolean"],
      ["price", "number", PER_UNIT],
      ["price_per_kilogram", "number", "€ / kg"],
      ["observed_on", "date"],
    ],
    filters: [
      ["species_id", "is"],
      ["merchant", "is"],
      ["label", "holds"],
    ],
  },
  {
    path: "/inputs/phytosanitary-price-readings",
    table: "registered_phytosanitary_price_readings",
    primaryKey: "id",
    datasource: "phytosanitary_prices",
    order: [
      ["observed_on", "DESC"],
      ["label", "ASC"],
    ],
    columns: [
      ["label", "text"],
      ["product_id", "number"],
      ["reference_name", "text"],
      ["active_substances", "list"],
      ["merchant", "text"],
      ["delivery_postal_code", "text"],
      ["price", "number", PER_UNIT],
      ["observed_on", "date"],
      ["negotiated", "boolean"],
    ],
    filters: [
      ["product_id", "is"],
      ["label", "holds"],
    ],
  },
]

export const titleOfInput = (resource: Pick<Resource, "path">) =>
  "inputs_" + resource.path.split("/").pop()!.replaceAll("-", "_") + "_title"

const labelOf = (t: Translator, field: string) => t("inputs_field_" + field)

const dayOf = (value: unknown) =>
  value instanceof Date ? value : new Date(String(value))

function valueOf(cxt: Context, row: Row, [field, kind, unit]: Column) {
  const label = labelOf(cxt.t, field)
  const value = row[field]

  if (value === undefined || value === null || value === "") {
    return undefined
  }

  const shown: Record<Kind, () => Hypermedia> = {
    text: () => Hypermedia.Text({ label, value: String(value) }),
    number: () =>
      Hypermedia.Number({
        label,
        value: Number(value),
        unit: typeof unit === "function" ? unit(row) : unit,
      }),
    boolean: () => Hypermedia.Boolean({ label, value: value === true }),
    list: () => HypermediaList({ label, values: value as unknown[] }) as Hypermedia,
    date: () =>
      Hypermedia.Date({
        label,
        value: cxt.dateTimeFormatter.Date(dayOf(value)),
        iso: dayOf(value).toISOString(),
      }),
    // A month is told by its first day: only the year and the month are shown
    month: () =>
      Hypermedia.Date({
        label,
        value: dayOf(value).toISOString().slice(0, 7),
        iso: dayOf(value).toISOString(),
      }),
  }

  return shown[kind]()
}

function page(cxt: Context, resource: Resource) {
  const query = resource.order.reduce(
    (select, [field, sort]) => select.orderBy(field, sort),
    Table<Row>({ table: resource.table, primaryKey: resource.primaryKey })(
      cxt.db,
    ).select(),
  )
  const filters = resource.filters ?? []

  return generateTablePage(cxt, {
    title: cxt.t(titleOfInput(resource)),
    breadcrumbs: Breadcrumbs(cxt.t),
    query,
    columns: Object.fromEntries(
      resource.columns.map(([field]) => [field, labelOf(cxt.t, field)]),
    ),
    form: Object.fromEntries(
      filters.map(([field]) => [
        field,
        Field.Text({ label: labelOf(cxt.t, field), required: false }),
      ]),
    ),
    formHandler: (input: Record<string, unknown>, select) => {
      filters.forEach(([field, how]) => {
        const asked = input[field]

        if (typeof asked === "string" && asked.length > 0) {
          how === "is"
            ? select.where(field, "=", asked)
            : select.where(field, "ILIKE", "%" + asked + "%")
        }
      })
    },
    handler: (row: Row) =>
      Object.fromEntries(
        resource.columns.map((column) => [column[0], valueOf(cxt, row, column)]),
      ),
    credits: CreditTable(cxt.db).select().where("datasource", "=", resource.datasource),
  })
}

const linkTo = (t: Translator) => (resource: Resource) =>
  Hypermedia.Link({ value: t(titleOfInput(resource)), method: "GET", href: resource.path })

const withPages = (api: API, resources: Resource[]) =>
  resources.reduce(
    (built, resource) => built.path(resource.path, (cxt) => page(cxt, resource)),
    api,
  )

const open = withPages(
  API.new().path("/inputs", ({ t }) =>
    AutoList({
      page: {
        title: t("inputs_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [...OPEN, ...RESERVED].map(linkTo(t)),
      },
      t,
    }),
  ),
  OPEN,
)

// Readings name the merchants and what each one sells: reserved to the holders of a key
export const Inputs = withPages(open.restrictedTo(MEMBERS_SCOPE), RESERVED)

export const INPUT_RESOURCES = { open: OPEN, reserved: RESERVED }
