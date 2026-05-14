import { Concurrently, match, None, Ok, Some, type AsyncResult } from "shulk"
import { Hypermedia, hypermedia2json, type HypermediaType } from "../../Hypermedia"
import { Field } from "../../templates/components/Form"
import type { Context } from "../../types/Context"
import {
  ParcelIdentifier,
  type ParcelIdentifierOkPage,
  type TableSection,
} from "../../templates/pages/ParcelIdentifier"
import { coordinatesToPoint, type Point } from "../../types/Geometry"
import { Country } from "../../types/Country"
import { MunicipalityTable, type Municipality } from "../GeographicalReferences/Municipality"
import { ParcelTable, type Parcel } from "../GeographicalReferences/CadastralParcel"
import { ParcelPriceTable, type ParcelPrice } from "../GeographicalReferences/CadastralParcelPrice"
import { CapParcelTable, type CapParcel } from "../GeographicalReferences/CapParcel"
import {
  MasterCapCodeTable,
  type MasterCapCode,
} from "../GeographicalReferences/MasterCapCode"
import {
  CadastralParcelOwnerTable,
  type CadastralParcelOwner,
} from "../GeographicalReferences/CadastralParcelOwner"
import {
  fetchOwnersByMajicDept,
  type CadastralOwner,
} from "../GeographicalReferences/CadastralOwner"
import {
  NaturalZoneTable,
  type NaturalZone,
} from "../GeographicalReferences/NaturalZone"
import {
  ProtectedWaterZoneTable,
  type ProtectedWaterZone,
} from "../GeographicalReferences/ProtectedWaterZone"
import { AreaItemTable, type AreaItem } from "../GeographicalReferences/AreaItem"
import { SoilDepthTable, type SoilDepth } from "../GeographicalReferences/SoilDepth"
import {
  SoilAvailableWaterCapacityTable,
  type SoilAvailableWaterCapacity,
} from "../GeographicalReferences/SoilAvailableWaterCapacity"
import type { Pool } from "pg"
import { HourlyReportTable, StationTable, type Station } from "../Weather"
import {
  ProductionYieldTable,
  ProductionPriceTable,
  type ProductionYield,
  type ProductionPrice,
} from "../Production"

const RED = "#EE6666"
const BLUE = "#5470C6"

const DEFAULT_CAP_CODE_YEAR = 2025
const CAP_CODE_YEAR_MIN = 2017
const CAP_CODE_YEAR_MAX = 2025

const EXPOSE_OWNERS = import.meta.env.EXPOSE_OWNERS === "true"

type EnrichedParcelOwner = CadastralParcelOwner & Partial<CadastralOwner>

interface ParcelData {
  municipality?: Municipality
  cadastralParcel?: Parcel
  cadastralParcelPrices?: ParcelPrice[]
  cadastralParcelOwners?: EnrichedParcelOwner[]
  capParcel?: CapParcel
  capCode?: MasterCapCode
  naturalZones?: NaturalZone[]
  protectedWaterZones?: ProtectedWaterZone[]
  areaItems?: AreaItem[]
  soilDepth?: SoilDepth
  soilWaterCapacity?: SoilAvailableWaterCapacity
  weatherStation?: Station
  lastYearWeatherReports?: Array<{
    station_id: string
    started_at: Date
    min_temp?: string
    max_temp?: string
    rain?: string
    humidity?: string
  }>
  historicalYields?: ProductionYield[]
  productionPrices?: ProductionPrice[]
}

export async function ParcelIdentifierController(
  cxt: Context,
  breadcrumbs: HypermediaType["Link"][],
) {
  const title = cxt.t("tools_parcel_identifier")

  const latitude = cxt.query.latitude ? parseFloat(cxt.query.latitude) : undefined
  const longitude = cxt.query.longitude ? parseFloat(cxt.query.longitude) : undefined

  const requestedYear = cxt.query.year ? parseInt(cxt.query.year) : DEFAULT_CAP_CODE_YEAR
  const capCodeYear =
    requestedYear >= CAP_CODE_YEAR_MIN && requestedYear <= CAP_CODE_YEAR_MAX
      ? requestedYear
      : DEFAULT_CAP_CODE_YEAR

  const form = {
    latitude: Field.Number({
      label: cxt.t("common_fields_latitude"),
      required: true,
      unit: "°",
      defaultValue: latitude,
    }),
    longitude: Field.Number({
      label: cxt.t("common_fields_longitude"),
      required: true,
      unit: "°",
      defaultValue: longitude,
    }),
  }

  const maybeCoordinates =
    latitude && longitude
      ? Some({ latitude, longitude })
      : None()

  const legend = {
    "temperature-max": {
      label: cxt.t("weather_station_hourly_report_temperature_max"),
      unit: "°C",
      type: "line",
      color: RED,
      side: "left",
      stack: "Total",
    },
    humidity: {
      label: cxt.t("weather_station_hourly_report_humidity"),
      unit: "%",
      type: "line",
      color: BLUE,
      side: "right",
    },
  }

  const page = await match(maybeCoordinates)
    .returnType<AsyncResult<Error, ParcelIdentifierOkPage>>()
    .case({
      None: async () => Ok({ title, breadcrumbs, form }),
      Some: async ({ val: coordinates }) => {
        const point = coordinatesToPoint(coordinates)

        const parcelDataResult = await retrieveParcelData(cxt.db, point, capCodeYear)

        return parcelDataResult.map((data) =>
          buildPage({
            title,
            breadcrumbs,
            form,
            cxt,
            data,
            coordinates,
            point,
            legend,
          }),
        )
      },
    })

  return match(cxt.output)
    .returnType<unknown>()
    .case({
      json: () => hypermedia2json(cxt.request, page.val),
      geojson: () => page.map((p) => p.geolocation?.shape).unwrapOr({}),
      html: () => ParcelIdentifier({ page, context: cxt }),
      _otherwise: () => "Format not supported",
    })
}

type Legend = Record<string, unknown>

interface BuildPageParams {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: ParcelIdentifierOkPage["form"]
  cxt: Context
  data: ParcelData
  coordinates: { latitude: number; longitude: number }
  point: Point
  legend: Legend
}

function buildPage(p: BuildPageParams): ParcelIdentifierOkPage {
  const { cxt, data, coordinates, point, legend } = p
  const t = cxt.t

  return {
    title: p.title,
    breadcrumbs: p.breadcrumbs,
    form: p.form,
    information: data.municipality
      ? buildMunicipalitySection(data.municipality, cxt)
      : undefined,
    cadastre: data.cadastralParcel
      ? buildCadastreSection(data.cadastralParcel, cxt)
      : undefined,
    cap: data.capParcel
      ? buildCapSection(data.capParcel, data.capCode, cxt)
      : undefined,
    soil:
      data.soilDepth || data.soilWaterCapacity
        ? buildSoilSection(data.soilDepth, data.soilWaterCapacity, cxt)
        : undefined,
    transactions:
      data.cadastralParcel && data.cadastralParcelPrices
        ? buildTransactionsSection(data.cadastralParcelPrices, cxt)
        : undefined,
    owners:
      EXPOSE_OWNERS && data.cadastralParcelOwners && data.cadastralParcelOwners.length > 0
        ? buildOwnersSection(data.cadastralParcelOwners, cxt)
        : undefined,
    "natural-zones":
      data.naturalZones && data.naturalZones.length > 0
        ? buildNaturalZonesSection(data.naturalZones, cxt)
        : undefined,
    "protected-water-zones":
      data.protectedWaterZones && data.protectedWaterZones.length > 0
        ? buildProtectedWaterZonesSection(data.protectedWaterZones, cxt)
        : undefined,
    "area-items":
      data.areaItems && data.areaItems.length > 0
        ? buildAreaItemsSection(data.areaItems, cxt)
        : undefined,
    "historical-yields":
      data.capCode?.production && data.historicalYields
        ? buildHistoricalYieldsChart(
            data.historicalYields,
            data.capCode.production,
            data.capCode.cap_label,
            cxt,
          )
        : undefined,
    "production-prices":
      data.productionPrices && data.productionPrices.length > 0
        ? buildProductionPricesSection(data.productionPrices, cxt)
        : undefined,
    "last-year-weather-reports":
      data.weatherStation && data.lastYearWeatherReports
        ? buildWeatherReportsSection(
            data.weatherStation,
            data.lastYearWeatherReports,
            cxt,
            legend,
          )
        : undefined,
    geolocation: data.cadastralParcel?.shape
      ? {
          coordinates,
          marker: point,
          shape: data.cadastralParcel.shape,
        }
      : undefined,
  }
}

async function retrieveParcelData(
  db: Pool,
  point: Point,
  capCodeYear: number,
): AsyncResult<Error, ParcelData> {
  const wave1 = await Concurrently.run(() =>
    MunicipalityTable(db).select().where("city_shape", "ST_CONTAINS", point).limit(1).run(),
  )
    .and(() =>
      ParcelTable(db).select().where("shape", "ST_CONTAINS", point).limit(1).run(),
    )
    .and(() =>
      CapParcelTable(db).select().where("shape", "ST_CONTAINS", point).limit(1).run(),
    )
    .and(() =>
      StationTable(db).select().orderByCloseness("centroid", point).limit(1).run(),
    )
    .and(() =>
      NaturalZoneTable(db).select().where("shape", "ST_CONTAINS", point).run(),
    )
    .and(() =>
      ProtectedWaterZoneTable(db).select().where("shape", "ST_CONTAINS", point).run(),
    )
    .and(() => AreaItemTable(db).select().where("shape", "ST_CONTAINS", point).run())
    .and(() => SoilDepthTable(db).select().where("shape", "ST_CONTAINS", point).limit(1).run())
    .and(() =>
      SoilAvailableWaterCapacityTable(db)
        .select()
        .where("shape", "ST_CONTAINS", point)
        .limit(1)
        .run(),
    )
    .done()

  if (wave1._state === "Err") {
    return wave1
  }

  const [
    municipalities,
    cadastralParcels,
    capParcels,
    stations,
    naturalZones,
    protectedWaterZones,
    areaItems,
    soilDepths,
    soilWaterCapacities,
  ] = wave1.val

  const municipality = municipalities[0]
  const cadastralParcel = cadastralParcels[0]
  const capParcel = capParcels[0]
  const station = stations[0]

  const WEATHER_WINDOW_DAYS = 30
  const weatherStartDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - WEATHER_WINDOW_DAYS)
    return d.toISOString()
  })()

  // Each wave-2 branch is independent: failure in one does not gate the others,
  // and absence of an upstream dependency falls back to `undefined`.

  const cadastreDependentResult = cadastralParcel
    ? await (async () => {
        const both = await Concurrently.run(() =>
          ParcelPriceTable(db)
            .select()
            .where("cadastral_parcel_id", "=", cadastralParcel.id)
            .orderBy("mutation_date", "DESC")
            .run(),
        )
          .and(() =>
            CadastralParcelOwnerTable(db)
              .select()
              .where("cadastral_parcel_id", "=", cadastralParcel.id)
              .run(),
          )
          .done()

        if (both._state === "Err") return both

        const [prices, parcelOwners] = both.val
        const ownerDictResult = await fetchOwnersByMajicDept(
          db,
          parcelOwners.map((po) => ({
            majic_number: po.majic_number,
            department_code: po.department_code,
          })),
        )
        const ownerDict = ownerDictResult.unwrapOr(new Map())
        const enriched: EnrichedParcelOwner[] = parcelOwners.map((po) => {
          const owner = ownerDict.get(`${po.majic_number}|${po.department_code}`)
          return owner ? { ...po, ...owner } : po
        })
        return Ok([prices, enriched] as [ParcelPrice[], EnrichedParcelOwner[]])
      })()
    : Ok([undefined, undefined] as [undefined, undefined])

  const weatherResult = station
    ? await HourlyReportTable(db)
        .select()
        .where("station_id", "=", station.reference_name)
        .where("started_at", ">=", weatherStartDate)
        .orderBy("started_at", "ASC")
        .run()
    : Ok(undefined)

  const capCodeResult = capParcel?.cap_crop_code
    ? await MasterCapCodeTable(db)
        .select()
        .where("cap_code", "=", capParcel.cap_crop_code)
        .where("year", "=", capCodeYear)
        .limit(1)
        .run()
    : Ok([] as MasterCapCode[])

  const department = deriveDepartmentZone(municipality)

  const productionDataResult = department
    ? await Concurrently.run(() =>
        ProductionYieldTable(db)
          .select()
          .where("department_zone", "=", department)
          .orderBy("campaign", "DESC")
          .run(),
      )
        .and(() =>
          ProductionPriceTable(db)
            .select()
            .where("department_zone", "=", department)
            .orderBy("started_on", "DESC")
            .limit(50)
            .run(),
        )
        .done()
    : Ok([undefined, undefined] as [undefined, undefined])

  const [cadastralParcelPrices, cadastralParcelOwners] =
    cadastreDependentResult.unwrapOr([undefined, undefined])
  const lastYearWeatherReports = weatherResult.unwrapOr(undefined)
  const capCode = capCodeResult.unwrapOr([])[0]
  const [historicalYields, productionPrices] = productionDataResult.unwrapOr([
    undefined,
    undefined,
  ])

  return Ok({
    municipality,
    cadastralParcel,
    cadastralParcelPrices,
    cadastralParcelOwners,
    capParcel,
    capCode,
    naturalZones,
    protectedWaterZones,
    areaItems,
    soilDepth: soilDepths[0],
    soilWaterCapacity: soilWaterCapacities[0],
    weatherStation: station,
    lastYearWeatherReports,
    historicalYields,
    productionPrices,
  })
}

function deriveDepartmentZone(municipality?: Municipality): string | undefined {
  if (!municipality || municipality.country !== Country.FR) {
    return undefined
  }
  return municipality.code.slice(0, 2)
}

function resolveMultilingualName(
  name: Record<string, string> | string | undefined,
  language: string,
): string | undefined {
  if (!name) return undefined
  if (typeof name === "string") return name
  return name[language] || name.fra || name.en || Object.values(name)[0]
}

function buildMunicipalitySection(
  municipality: Municipality,
  cxt: Context,
): Record<string, Hypermedia> {
  return {
    country: Hypermedia.Text({
      label: cxt.t("common_fields_country"),
      value: cxt.t("country_" + municipality.country),
    }),
    city: Hypermedia.Link({
      label: cxt.t("geographical_references_municipality_city"),
      value: municipality.city_name,
      method: "GET",
      href: "/geographical-references/municipalities/" + municipality.id,
    }),
    "city-code": Hypermedia.Text({
      label: cxt.t("geographical_references_municipality_city_code"),
      value: municipality.code,
    }),
    "postal-code": Hypermedia.Text({
      label: cxt.t("geographical_references_municipality_postal_code"),
      value: municipality.postal_code,
    }),
  }
}

function buildCadastreSection(parcel: Parcel, cxt: Context): Record<string, Hypermedia> {
  return {
    id: Hypermedia.Link({
      label: cxt.t("geographical_references_cadastral_parcel_id"),
      value: parcel.id,
      method: "GET",
      href: "/geographical-references/cadastral-parcels/" + parcel.id,
    }),
    prefix: Hypermedia.Text({
      label: cxt.t("geographical_references_cadastral_parcel_section_prefix"),
      value: parcel.section_prefix,
    }),
    section: Hypermedia.Text({
      label: cxt.t("geographical_references_cadastral_parcel_section"),
      value: parcel.section,
    }),
    number: Hypermedia.Text({
      label: cxt.t("geographical_references_cadastral_parcel_work_number"),
      value: parcel.work_number,
    }),
    area: Hypermedia.Number({
      label: cxt.t("geographical_references_cadastral_parcel_area"),
      value: parcel.net_surface_area,
      unit: "m²",
    }),
  }
}

function buildCapSection(
  capParcel: CapParcel,
  capCode: MasterCapCode | undefined,
  cxt: Context,
): Record<string, Hypermedia> {
  const section: Record<string, Hypermedia> = {
    id: Hypermedia.Link({
      label: cxt.t("geographical_references_cap_parcel_id"),
      value: capParcel.id,
      method: "GET",
      href: "/geographical-references/cap-parcels/" + capParcel.id,
    }),
    "crop-code": Hypermedia.Text({
      label: cxt.t("geographical_references_cap_parcel_crop_code"),
      value: capParcel.cap_crop_code,
    }),
  }

  if (capCode) {
    section.culture = Hypermedia.Text({
      label: cxt.t("geographical_references_cap_parcel_culture"),
      value: capCode.cap_label,
    })
    section.production = Hypermedia.Text({
      label: cxt.t("tools_cap_production"),
      value: capCode.production,
    })
    section.year = Hypermedia.Number({
      label: cxt.t("tools_cap_year"),
      value: capCode.year,
    })
    if (capCode.cap_category) {
      section.category = Hypermedia.Text({
        label: cxt.t("tools_cap_category"),
        value: capCode.cap_category,
      })
    }
    if (capCode.cap_precision) {
      section.precision = Hypermedia.Text({
        label: cxt.t("tools_cap_precision"),
        value: capCode.cap_precision,
      })
    }
    section["is-seed"] = Hypermedia.Boolean({
      label: cxt.t("tools_cap_is_seed"),
      value: capCode.is_seed === true,
    })
  }

  return section
}

function buildSoilSection(
  depth: SoilDepth | undefined,
  awc: SoilAvailableWaterCapacity | undefined,
  cxt: Context,
): Record<string, Hypermedia> {
  const section: Record<string, Hypermedia> = {}

  if (depth?.soil_depth_value !== undefined) {
    section["depth"] = Hypermedia.Number({
      label: cxt.t("tools_soil_depth"),
      value: parseFloat(depth.soil_depth_value as any),
      unit: depth.soil_depth_unit === "centimeter" ? "cm" : depth.soil_depth_unit || "",
    })
  }

  if (awc) {
    if (awc.available_water_label) {
      section["available-water"] = Hypermedia.Text({
        label: cxt.t("tools_soil_available_water"),
        value: awc.available_water_label,
      })
    }
    if (awc.available_water_min_value !== undefined) {
      section["available-water-min"] = Hypermedia.Number({
        label: cxt.t("tools_soil_available_water_min"),
        value: parseFloat(awc.available_water_min_value as any),
        unit: awc.available_water_unit === "millimeter" ? "mm" : awc.available_water_unit || "",
      })
    }
    if (awc.available_water_max_value !== undefined) {
      section["available-water-max"] = Hypermedia.Number({
        label: cxt.t("tools_soil_available_water_max"),
        value: parseFloat(awc.available_water_max_value as any),
        unit: awc.available_water_unit === "millimeter" ? "mm" : awc.available_water_unit || "",
      })
    }
  }

  return section
}

function buildTransactionsSection(prices: ParcelPrice[], cxt: Context): TableSection {
  return {
    label: cxt.t("tools_transactions"),
    columns: {
      id: cxt.t("geographical_references_cadastral_parcel_price_id"),
      date: cxt.t("common_fields_date"),
      address: cxt.t("common_fields_address"),
      "building-nature": cxt.t(
        "geographical_references_cadastral_parcel_price_building_nature",
      ),
      price: cxt.t("tools_price"),
    },
    rows: prices.map((price) => ({
      id: Hypermedia.Link({
        label: cxt.t("geographical_references_cadastral_parcel_price_id"),
        value: price.id,
        method: "GET",
        href: "/geographical-references/cadastral-parcel-prices/" + price.id,
      }),
      date: Hypermedia.Date({
        label: cxt.t("common_fields_date"),
        value: cxt.dateTimeFormatter.Date(new Date(price.mutation_date)),
        iso: new Date(price.mutation_date).toISOString(),
      }),
      address: Hypermedia.Text({
        label: cxt.t("common_fields_address"),
        value: price.address,
      }),
      "building-nature": price.building_nature
        ? Hypermedia.Text({
            label: cxt.t("geographical_references_cadastral_parcel_price_building_nature"),
            value: price.building_nature,
          })
        : undefined,
      price: Hypermedia.Number({
        label: cxt.t("tools_price"),
        value: parseFloat(price.cadastral_price as any),
        unit: "€",
      }),
    })),
  }
}

function buildOwnersSection(
  owners: EnrichedParcelOwner[],
  cxt: Context,
): TableSection {
  return {
    label: cxt.t("tools_owners"),
    columns: {
      denomination: cxt.t("tools_owner_denomination"),
      "legal-form": cxt.t("tools_owner_legal_form"),
      siren: cxt.t("tools_owner_siren"),
      "suf-area": cxt.t("tools_owner_suf_area"),
      "culture-nature": cxt.t("tools_owner_culture_nature"),
    },
    rows: owners.map((owner) => ({
      denomination: owner.denomination
        ? Hypermedia.Text({
            label: cxt.t("tools_owner_denomination"),
            value: owner.denomination,
          })
        : undefined,
      "legal-form": owner.legal_form_short
        ? Hypermedia.Text({
            label: cxt.t("tools_owner_legal_form"),
            value: owner.legal_form_short,
          })
        : undefined,
      siren: owner.siren
        ? Hypermedia.Text({
            label: cxt.t("tools_owner_siren"),
            value: owner.siren,
          })
        : undefined,
      "suf-area": owner.suf_surface_area
        ? Hypermedia.Number({
            label: cxt.t("tools_owner_suf_area"),
            value: owner.suf_surface_area,
            unit: "m²",
          })
        : undefined,
      "culture-nature": owner.culture_nature_code
        ? Hypermedia.Text({
            label: cxt.t("tools_owner_culture_nature"),
            value: owner.culture_nature_code,
          })
        : undefined,
    })),
  }
}

function buildNaturalZonesSection(zones: NaturalZone[], cxt: Context): TableSection {
  return {
    label: cxt.t("tools_natural_zones"),
    columns: {
      name: cxt.t("common_fields_name"),
      nature: cxt.t("tools_zone_nature"),
      id: cxt.t("ID"),
    },
    rows: zones.map((z) => ({
      name: z.name
        ? Hypermedia.Text({
            label: cxt.t("common_fields_name"),
            value: z.name,
          })
        : undefined,
      nature: Hypermedia.Text({
        label: cxt.t("tools_zone_nature"),
        value: z.nature,
      }),
      id: Hypermedia.Text({
        label: cxt.t("ID"),
        value: z.id,
      }),
    })),
  }
}

function buildProtectedWaterZonesSection(
  zones: ProtectedWaterZone[],
  cxt: Context,
): TableSection {
  return {
    label: cxt.t("tools_protected_water_zones"),
    columns: {
      name: cxt.t("common_fields_name"),
      "administrative-zone": cxt.t("tools_zone_administrative"),
      creator: cxt.t("tools_zone_creator"),
    },
    rows: zones.map((z) => ({
      name: z.name
        ? Hypermedia.Text({ label: cxt.t("common_fields_name"), value: z.name })
        : undefined,
      "administrative-zone": z.administrative_zone
        ? Hypermedia.Text({
            label: cxt.t("tools_zone_administrative"),
            value: z.administrative_zone,
          })
        : undefined,
      creator: z.creator_name
        ? Hypermedia.Text({ label: cxt.t("tools_zone_creator"), value: z.creator_name })
        : undefined,
    })),
  }
}

function buildAreaItemsSection(items: AreaItem[], cxt: Context): TableSection {
  return {
    label: cxt.t("tools_area_items"),
    columns: {
      name: cxt.t("common_fields_name"),
      nature: cxt.t("tools_zone_nature"),
    },
    rows: items.map((item) => {
      const name = resolveMultilingualName(item.name, cxt.language)
      return {
        name: name
          ? Hypermedia.Text({ label: cxt.t("common_fields_name"), value: name })
          : undefined,
        nature: item.nature
          ? Hypermedia.Text({ label: cxt.t("tools_zone_nature"), value: item.nature })
          : undefined,
      }
    }),
  }
}

const YIELD_CHART_COLOR = "#10ac84"

function buildHistoricalYieldsChart(
  yields: ProductionYield[],
  capProduction: string,
  capLabel: string,
  cxt: Context,
): NonNullable<ParcelIdentifierOkPage["historical-yields"]> | undefined {
  const filtered = yields
    .filter((y) => y.production === capProduction)
    .slice()
    .sort((a, b) => a.campaign - b.campaign)

  if (filtered.length === 0) {
    return undefined
  }

  const unitRaw = filtered[0].yield_unit
  const unit = unitRaw === "quintal_per_hectare" ? "q/ha" : unitRaw

  const legend = {
    yield: {
      label: cxt.t("tools_yield"),
      unit,
      type: "line" as const,
      color: YIELD_CHART_COLOR,
      side: "left" as const,
    },
  }

  const values = filtered.reduce<Record<string, { yield: number }>>((acc, row) => {
    acc[String(row.campaign)] = { yield: parseFloat(row.yield_value as any) }
    return acc
  }, {})

  return {
    production: Hypermedia.Text({
      label: cxt.t("tools_cap_production"),
      value: capLabel,
    }),
    unit: Hypermedia.Text({
      label: cxt.t("tools_yield"),
      value: unit,
    }),
    legend,
    values,
  }
}

function buildProductionPricesSection(
  prices: ProductionPrice[],
  cxt: Context,
): TableSection {
  return {
    label: cxt.t("tools_production_prices"),
    columns: {
      campaign: cxt.t("tools_campaign"),
      specie: cxt.t("tools_specie"),
      "started-on": cxt.t("common_fields_date_start"),
      price: cxt.t("tools_price"),
      organic: cxt.t("tools_production_organic"),
    },
    rows: prices.map((p) => ({
      campaign: p.campaign
        ? Hypermedia.Number({ label: cxt.t("tools_campaign"), value: p.campaign })
        : undefined,
      specie: Hypermedia.Text({ label: cxt.t("tools_specie"), value: p.specie }),
      "started-on": Hypermedia.Date({
        label: cxt.t("common_fields_date_start"),
        value: cxt.dateTimeFormatter.Date(new Date(p.started_on)),
        iso: new Date(p.started_on).toISOString(),
      }),
      price: Hypermedia.Number({
        label: cxt.t("tools_price"),
        value: parseFloat(p.final_price as any),
        unit:
          (p.currency === "EUR" ? "€" : p.currency) +
          (p.price_unit ? " / " + p.price_unit : ""),
      }),
      organic: Hypermedia.Boolean({
        label: cxt.t("tools_production_organic"),
        value: p.organic === true,
      }),
    })),
  }
}

function buildWeatherReportsSection(
  station: Station,
  reports: ParcelData["lastYearWeatherReports"] & {},
  cxt: Context,
  legend: any,
) {
  return {
    station: Hypermedia.Link({
      label: cxt.t("weather_station"),
      value: station.station_name + " " + station.station_code,
      method: "GET",
      href: "/weather/stations/" + station.reference_name,
    }),
    legend,
    // Mutate the accumulator instead of spreading (was O(N^2) on ~8700 rows).
    values: reports.reduce<Record<string, { "temperature-max": number; humidity: number }>>(
      (acc, curr) => {
        acc[cxt.dateTimeFormatter.DateTime(curr.started_at)] = {
          "temperature-max": parseFloat(curr.max_temp as any),
          humidity: parseFloat(curr.humidity as any),
        }
        return acc
      },
      {},
    ),
  }
}
