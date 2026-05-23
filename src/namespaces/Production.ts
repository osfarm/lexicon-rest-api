import { Table } from "../Database"
import { generateTablePage } from "../page-generators/generateTablePage"
import { generateMapSection } from "../page-generators/generateMapSection"
import { Hypermedia } from "../Hypermedia"
import { Field } from "../templates/components/Form"
import { AutoList } from "../templates/views/AutoList"
import { ProductionPricesMapPage } from "../templates/views/ProductionPricesMapPage"
import { CreditTable } from "./Credits"
import type { Translator } from "../Translator"
import type { Context } from "../types/Context"
import { isString, ObjectFlatMap } from "../utils"
import { API } from "../API"
import { AdministrativeAreaTable } from "./GeographicalReferences/AdministrativeArea"
import { Concurrently } from "shulk"

interface Production {
  reference_name: string
  activity_family: ActivityFamily
  specie: string
  usage?: ProductionUsage
  agroedi_crop_code?: string
  registration_date?: Date
  translation_id: string
  // Translation table fields
  id: string
  fra: string
  eng: string
}

export enum ActivityFamily {
  ADMINISTERING = "administering",
  PLANT_FARMING = "plant_farming",
  ANIMAL_FARMING = "animal_farming",
  SERVICE_DELIVERING = "service_delivering",
  TOOL_MAINTAINING = "tool_maintaining",
  PROCESSING = "processing",
  VINE_FARMING = "vine_farming",
  WINE_MAKING = "wine_making",
}

export enum ProductionUsage {
  FODDER = "fodder",
  FRUIT = "fruit",
  PLANT = "plant",
  GRAIN = "grain",
  VEGETABLE = "vegetable",
  FLOWER = "flower",
  MEAT = "meat",
  MEADOW = "meadow",
  MILK = "milk",
  SEED = "seed",
}

const ProductionTable = Table<Production>({
  table: "master_productions",
  primaryKey: "reference_name",
  oneToOne: {
    translation_id: { table: "master_translations", primaryKey: "id" },
  },
})

export interface ProductionYield {
  department_zone: string
  specie: string
  production: string
  yield_value: number
  yield_unit: string
  campaign: number
}

export const ProductionYieldTable = Table<ProductionYield>({
  table: "master_production_yields",
  primaryKey: "department_zone",
})

export interface ProductionPrice {
  department_zone: string
  started_on: Date
  nature?: string
  price_duration: unknown
  specie: string
  waiting_price: number
  final_price: number
  currency: string
  price_unit: string
  product_output_specie: string
  production_reference_name?: string
  campaign?: number
  organic?: boolean
  label?: string
}

export const ProductionPriceTable = Table<ProductionPrice>({
  table: "master_production_prices",
  primaryKey: "department_zone",
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

export const Production = API.new()
  .path("/production", ({ t }) =>
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
          Hypermedia.Link({
            value: t("production_prices_title"),
            method: "GET",
            href: "/production/prices",
          }),
          Hypermedia.Link({
            value: t("production_prices_map_title"),
            method: "GET",
            href: "/production/prices/map",
          }),
        ],
      },
      t,
    }),
  )
  .path("/production/productions", async (cxt) =>
    generateTablePage(cxt, {
      title: cxt.t("productions_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ProductionTable(cxt.db).select().orderBy("reference_name", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        family: cxt.t("activity_family"),
        usage: cxt.t("usage"),
      },
      form: {
        family: Field.Select({
          label: cxt.t("activity_family"),
          required: false,
          options: ObjectFlatMap(ActivityFamily, (_, val) => ({
            [val]: cxt.t("productions_family_" + val),
          })),
        }),
        usage: Field.Select({
          label: cxt.t("usage"),
          required: false,
          options: ObjectFlatMap(ProductionUsage, (_, val) => ({
            [val]: cxt.t("productions_usage_" + val),
          })),
        }),
      },
      formHandler: (input, query) => {
        if (input.family) {
          query.where("activity_family", "=", input.family)
        }
        if (input.usage) {
          query.where("usage", "=", input.usage)
        }
      },
      handler: (resource) => ({
        name: Hypermedia.Text({
          label: cxt.t("reference_name"),
          value: resource.fra,
        }),
        family: Hypermedia.Text({
          label: cxt.t("activity_family"),
          value: cxt.t("productions_family_" + resource.activity_family),
        }),
        usage: resource.usage
          ? Hypermedia.Text({
              label: cxt.t("usage"),
              value: cxt.t("productions_usage_" + resource.usage),
            })
          : undefined,
      }),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "productions"),
    }),
  )
  .path("/production/prices", async (cxt) => {
    const species = await fetchDistinctSpecies(cxt)

    return generateTablePage(cxt, {
      title: cxt.t("production_prices_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: ProductionPriceTable(cxt.db)
        .select()
        .orderBy("started_on", "DESC")
        .orderBy("department_zone", "ASC")
        .orderBy("specie", "ASC"),
      credits: CreditTable(cxt.db).select().where("datasource", "=", "prices"),
      columns: {
        department: cxt.t("production_prices_department"),
        specie: cxt.t("tools_specie"),
        "started-on": cxt.t("common_fields_date"),
        campaign: cxt.t("tools_campaign"),
        price: cxt.t("production_prices_price"),
        organic: cxt.t("tools_production_organic"),
        label: cxt.t("production_prices_label"),
      },
      form: {
        department: Field.Text({
          label: cxt.t("production_prices_department"),
          required: false,
        }),
        specie: Field.Select({
          label: cxt.t("tools_specie"),
          required: false,
          options: Object.fromEntries(species.map((s) => [s, cxt.t("taxonomy_" + s)])),
        }),
        campaign: Field.Number({
          label: cxt.t("tools_campaign"),
          required: false,
        }),
      },
      formHandler: (input, query) => {
        if (isString(input.department) && input.department.length > 0) {
          query.where("department_zone", "=", input.department)
        }
        if (input.specie) {
          query.where("specie", "=", input.specie)
        }
        if (input.campaign) {
          query.where("campaign", "=", input.campaign)
        }
      },
      handler: (price) => ({
        department: Hypermedia.Text({
          label: cxt.t("production_prices_department"),
          value: price.department_zone,
        }),
        specie: Hypermedia.Text({
          label: cxt.t("tools_specie"),
          value: cxt.t("taxonomy_" + price.specie),
        }),
        "started-on": Hypermedia.Date({
          label: cxt.t("common_fields_date"),
          value: cxt.dateTimeFormatter.Date(price.started_on),
          iso: new Date(price.started_on).toISOString(),
        }),
        campaign: price.campaign
          ? Hypermedia.Number({
              label: cxt.t("tools_campaign"),
              value: price.campaign,
            })
          : undefined,
        price: Hypermedia.Number({
          label: cxt.t("production_prices_price"),
          value: Number(price.final_price),
          unit: `${price.currency} / ${cxt.t("production_prices_unit_" + price.price_unit)}`,
        }),
        organic:
          price.organic !== undefined && price.organic !== null
            ? Hypermedia.Boolean({
                label: cxt.t("tools_production_organic"),
                value: price.organic,
              })
            : undefined,
        label: price.label
          ? Hypermedia.Text({
              label: cxt.t("production_prices_label"),
              value: price.label,
            })
          : undefined,
      }),
    })
  })
  .path("/production/prices/map", async (cxt) => generateProductionPricesMap(cxt))

async function fetchDistinctSpecies(cxt: Context): Promise<string[]> {
  const result = await ProductionPriceTable(cxt.db)
    .select("specie")
    .distinct()
    .orderBy("specie", "ASC")
    .run()
  return result.unwrapOr([]).map((row) => row.specie)
}

interface PriceAggregate {
  department_zone: string
  avg_price: string
  min_price: string
  max_price: string
  price_count: string
  currency: string
  price_unit: string
}

function priceToColor(price: number, min: number, max: number): string {
  const normalized = max > min ? (price - min) / (max - min) : 0.5
  const hue = 120 - normalized * 120
  return `hsl(${hue}, 70%, 50%)`
}

async function generateProductionPricesMap(cxt: Context) {
  const species = await fetchDistinctSpecies(cxt)

  const querySpecie = isString(cxt.query.specie) ? cxt.query.specie : undefined
  const selectedSpecie =
    querySpecie && species.includes(querySpecie) ? querySpecie : species[0]
  const campaignParam = cxt.query.campaign
  const selectedCampaign =
    isString(campaignParam) && campaignParam.length > 0
      ? parseInt(campaignParam)
      : undefined

  const speciesOptions = Object.fromEntries(
    species.map((s) => [s, cxt.t("taxonomy_" + s)]),
  )

  const form = {
    specie: Field.Select({
      label: cxt.t("tools_specie"),
      required: false,
      options: speciesOptions,
      defaultValue: selectedSpecie,
    }),
    campaign: Field.Number({
      label: cxt.t("tools_campaign"),
      required: false,
      defaultValue: selectedCampaign,
    }),
  }

  const breadcrumbs = [
    ...Breadcrumbs(cxt.t),
    Hypermedia.Link({
      value: cxt.t("production_prices_title"),
      method: "GET",
      href: "/production/prices",
    }),
  ]

  if (!selectedSpecie) {
    return ProductionPricesMapPage({
      title: cxt.t("production_prices_map_title"),
      breadcrumbs,
      t: cxt.t,
      form,
      submitLabel: cxt.t("filter"),
      message: cxt.t("production_prices_map_no_data"),
    })
  }

  const priceQuery = ProductionPriceTable(cxt.db)
    .select(
      "department_zone",
      "AVG(final_price)::numeric(8,2) AS avg_price" as any,
      "MIN(final_price) AS min_price" as any,
      "MAX(final_price) AS max_price" as any,
      "COUNT(*) AS price_count" as any,
      "MAX(currency) AS currency" as any,
      "MAX(price_unit) AS price_unit" as any,
    )
    .where("specie", "=", selectedSpecie)
    .groupBy("department_zone")

  if (selectedCampaign !== undefined && !Number.isNaN(selectedCampaign)) {
    priceQuery.where("campaign", "=", selectedCampaign)
  }

  const dataResult = await Concurrently.run(() => priceQuery.run())
    .and(() =>
      AdministrativeAreaTable(cxt.db)
        .select("kind", "code", "name", "shape", "centroid")
        .where("kind", "=", "department")
        .run(),
    )
    .done()

  if (dataResult._state === "Err") {
    return ProductionPricesMapPage({
      title: cxt.t("production_prices_map_title"),
      breadcrumbs,
      t: cxt.t,
      form,
      submitLabel: cxt.t("filter"),
      message: dataResult.val.message,
    })
  }

  const [rawAggregates, departments] = dataResult.val
  const aggregates = rawAggregates as unknown as PriceAggregate[]

  const aggregateByDept = new Map(aggregates.map((a) => [a.department_zone, a]))

  const avgValues = aggregates.map((a) => Number(a.avg_price))
  const minAvg = avgValues.length > 0 ? Math.min(...avgValues) : 0
  const maxAvg = avgValues.length > 0 ? Math.max(...avgValues) : 0

  const avgLabel = cxt.t("production_prices_avg")
  const minLabel = cxt.t("production_prices_min")
  const maxLabel = cxt.t("production_prices_max")
  const countLabel = cxt.t("production_prices_count")

  const shapes = departments.flatMap((dept) => {
    const agg = aggregateByDept.get(dept.code)
    if (!agg) {
      return []
    }
    const avg = Number(agg.avg_price)
    const unit = cxt.t("production_prices_unit_" + agg.price_unit)
    const fillColor = priceToColor(avg, minAvg, maxAvg)

    const html = `
      <strong>${dept.name} (${dept.code})</strong><br/>
      <b>${avgLabel}:</b> ${avg.toFixed(2)} ${agg.currency} / ${unit}<br/>
      <b>${minLabel}:</b> ${Number(agg.min_price).toFixed(2)} ${agg.currency}<br/>
      <b>${maxLabel}:</b> ${Number(agg.max_price).toFixed(2)} ${agg.currency}<br/>
      <b>${countLabel}:</b> ${agg.price_count}
    `

    return [
      {
        ...dept.shape,
        properties: {
          html,
          style: {
            color: "#444",
            weight: 1,
            fillColor,
            fillOpacity: 0.65,
          },
        },
      },
    ]
  })

  if (cxt.output === "geojson") {
    const featureCollection = generateMapSection({
      output: cxt.output,
      center: { latitude: 46.5, longitude: 2.5 },
      markers: [],
      shapes,
    })
    return new Response(JSON.stringify(featureCollection), {
      headers: { "Content-Type": "application/geo+json" },
    })
  }

  if (cxt.output === "json" || cxt.output === "csv") {
    const departmentNameByCode = new Map(departments.map((d) => [d.code, d.name]))
    const rows = aggregates.map((a) => ({
      department_zone: a.department_zone,
      department_name: departmentNameByCode.get(a.department_zone),
      specie: selectedSpecie,
      campaign: selectedCampaign,
      avg_price: Number(a.avg_price),
      min_price: Number(a.min_price),
      max_price: Number(a.max_price),
      price_count: parseInt(a.price_count),
      currency: a.currency,
      price_unit: a.price_unit,
    }))

    if (cxt.output === "csv") {
      const header =
        "department_zone,department_name,specie,campaign,avg_price,min_price,max_price,price_count,currency,price_unit"
      const lines = rows.map((r) =>
        [
          r.department_zone,
          `"${r.department_name ?? ""}"`,
          r.specie,
          r.campaign ?? "",
          r.avg_price,
          r.min_price,
          r.max_price,
          r.price_count,
          r.currency,
          r.price_unit,
        ].join(","),
      )
      return new Response([header, ...lines].join("\n"), {
        headers: { "Content-Type": "text/csv" },
      })
    }
    return new Response(JSON.stringify({ "@id": cxt.request.url, items: rows }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const legend =
    avgValues.length > 0
      ? buildLegend(minAvg, maxAvg, aggregates[0].currency, cxt)
      : undefined

  return ProductionPricesMapPage({
    title:
      cxt.t("production_prices_map_title") +
      " — " +
      cxt.t("taxonomy_" + selectedSpecie),
    breadcrumbs,
    t: cxt.t,
    form,
    submitLabel: cxt.t("filter"),
    message:
      shapes.length === 0 ? cxt.t("production_prices_map_no_data") : undefined,
    legendTitle: cxt.t("production_prices_avg"),
    legend,
    map: {
      center: { latitude: 46.5, longitude: 2.5 },
      shapes,
      zoom: 6,
    },
  })
}

function buildLegend(
  min: number,
  max: number,
  currency: string,
  cxt: Context,
): { label: string; color: string }[] {
  if (max <= min) {
    return [{ label: `${min.toFixed(2)} ${currency}`, color: priceToColor(min, min, max) }]
  }
  const steps = 5
  return Array.from({ length: steps }, (_, i) => {
    const value = min + ((max - min) * i) / (steps - 1)
    return {
      label: `${value.toFixed(0)} ${currency}`,
      color: priceToColor(value, min, max),
    }
  })
}
