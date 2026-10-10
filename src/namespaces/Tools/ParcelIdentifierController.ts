import { MEMBERS_SCOPE } from "../../access/Plan"
import { Concurrently, Err, match, None, Ok, Some, type AsyncResult } from "shulk"
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
import { pointToCoordinates } from "../../types/Coordinates"
import { subsidiesByYear } from "../../cap-subsidies/CapSubsidies"
import { cropHistoryAt, type CropOfCampaign } from "../../cap-history/CapHistory"
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
import {
  EnterpriseTable,
  fetchSubsidiesBySiren,
  type CapSubsidy,
  type Enterprise,
} from "../Enterprise"
import { MsaPopulationTable, type MsaPopulation } from "../MsaPopulation"
import {
  buildingsOn,
  surroundingsOf,
  zonesAt,
  type ZoneAtPoint,
  type BuildingsOnParcel,
  type Surroundings,
  cropContext,
  grossProductOf,
  waterNear,
  type CropContext,
  type WaterNearby,
} from "../../parcel-context/ParcelContext"

// The colours of the site (public/style.css): ink for what is measured, water for
// the rain, each with a lighter tint for the ten-year average
const TEMPERATURE = "#0e3d48"
const TEMPERATURE_AVERAGE = "#9db4b9"
const RAIN = "#5b99c7"
const RAIN_AVERAGE = "#c5dcec"
const WEATHER_HISTORY_YEARS = 10
const WEATHER_WINDOW_DAYS = 30
const ONE_DAY_IN_MS = 24 * 3600 * 1000

// Paris, Lyon and Marseille are in the reference twice: as whole communes and as
// arrondissements. A point is told by its arrondissement, which the other datasets use.
const WHOLE_COMMUNES = ["75056", "69123", "13055"]

const DEFAULT_CAP_CODE_YEAR = 2025
const CAP_CODE_YEAR_MIN = 2017
const CAP_CODE_YEAR_MAX = 2025

// The owners file of the DGFiP lists legal persons only. Two of its groups can
// still carry the name of someone: co-owners and partners known by no SIREN
const GROUPS_NAMING_PEOPLE = ["7", "8"]

// Whether the name of an owner can be shown: a company, a public body, never a person
const isNameable = (owner: EnrichedParcelOwner) =>
  Boolean(owner.siren) ||
  (owner.person_group_code !== undefined &&
    owner.person_group_code !== null &&
    !GROUPS_NAMING_PEOPLE.includes(owner.person_group_code.charAt(0)))

type EnrichedParcelOwner = CadastralParcelOwner & Partial<CadastralOwner>

interface HistoricalDailyAggregate {
  month: number
  day: number
  avg_max_temp: number | null
  avg_rain: number | null
}

interface ParcelData {
  municipality?: Municipality
  cadastralParcel?: Parcel
  cadastralParcelPrices?: ParcelPrice[]
  cadastralParcelOwners?: EnrichedParcelOwner[]
  // Whether the caller holds a key that reads owners
  ownersReadable?: boolean
  capParcel?: CapParcel
  capCode?: MasterCapCode
  // What was declared here in the campaigns before the latest one
  capHistory?: CropOfCampaign[]
  naturalZones?: NaturalZone[]
  protectedWaterZones?: ProtectedWaterZone[]
  areaItems?: ZoneAtPoint[]
  soilDepth?: SoilDepth
  soilWaterCapacity?: SoilAvailableWaterCapacity
  weatherStation?: Station
  // The day of the latest report of the station: the reports shown end there
  weatherUntil?: Date
  lastYearWeatherReports?: Array<{
    station_id: string
    started_at: Date
    min_temp?: string
    max_temp?: string
    rain?: string
    humidity?: string
  }>
  historicalDailyWeather?: HistoricalDailyAggregate[]
  historicalYields?: ProductionYield[]
  productionPrices?: ProductionPrice[]
  agriculturalEnterprises?: Enterprise[]
  subsidiesBySiren?: Map<string, CapSubsidy[]>
  msaPopulations?: MsaPopulation[]
  // Water within reach of the parcel, the closest first
  water?: WaterNearby[]
  buildings?: BuildingsOnParcel
  // Dwellings, hedges and vegetation around the cadastral parcel
  surroundings?: Surroundings
  // What Lexicon holds about the crop declared here, in this department
  crop?: CropContext
  department?: string
}

export async function ParcelIdentifierController(
  cxt: Context,
  breadcrumbs: HypermediaType["Link"][],
) {
  const title = cxt.t("tools_parcel_identifier")

  const latitude = cxt.query.latitude ? parseFloat(cxt.query.latitude) : undefined
  const longitude = cxt.query.longitude ? parseFloat(cxt.query.longitude) : undefined

  // Without a year asked for, the crop is named as in the campaign of the declaration
  const requestedYear = cxt.query.year ? parseInt(cxt.query.year) : undefined
  const capCodeYear =
    requestedYear !== undefined &&
    requestedYear >= CAP_CODE_YEAR_MIN &&
    requestedYear <= CAP_CODE_YEAR_MAX
      ? requestedYear
      : undefined

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
      color: TEMPERATURE,
      side: "left",
    },
    "temperature-max-avg": {
      label: cxt.t("weather_station_hourly_report_temperature_max_10y_avg"),
      unit: "°C",
      type: "line",
      color: TEMPERATURE_AVERAGE,
      dashed: true,
      side: "left",
    },
    rain: {
      label: cxt.t("weather_station_hourly_report_rain"),
      unit: "mm",
      type: "bar",
      color: RAIN,
      side: "right",
    },
    "rain-avg": {
      label: cxt.t("weather_station_hourly_report_rain_10y_avg"),
      unit: "mm",
      type: "bar",
      color: RAIN_AVERAGE,
      side: "right",
    },
  }

  const page = await match(maybeCoordinates)
    .returnType<AsyncResult<Error, ParcelIdentifierOkPage>>()
    .case({
      None: async () => Ok({ title, breadcrumbs, form }),
      Some: async ({ val: coordinates }) => {
        const point = coordinatesToPoint(coordinates)

        const parcelDataResult = await retrieveParcelData(
          cxt.db,
          point,
          capCodeYear,
          cxt.identity.scopes.includes(MEMBERS_SCOPE),
        )

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
    point: coordinates,
    information: data.municipality
      ? buildMunicipalitySection(data.municipality, cxt)
      : undefined,
    links: data.municipality
      ? buildLinksSection(data.municipality, cxt)
      : undefined,
    cadastre: data.cadastralParcel
      ? {
          ...buildCadastreSection(data.cadastralParcel, cxt),
          ...(data.buildings !== undefined
            ? {
                buildings: Hypermedia.Number({
                  label: t("tools_parcel_buildings"),
                  value: data.buildings.count,
                }),
                ...(data.buildings.count > 0
                  ? {
                      "buildings-ground-area": Hypermedia.Number({
                        label: t("tools_parcel_buildings_area"),
                        value: data.buildings.area,
                        unit: "m²",
                      }),
                    }
                  : {}),
                ...(data.buildings.agricultural > 0
                  ? {
                      "agricultural-buildings": Hypermedia.Number({
                        label: t("tools_parcel_buildings_agricultural"),
                        value: data.buildings.agricultural,
                      }),
                    }
                  : {}),
              }
            : {}),
        }
      : undefined,
    cap:
      data.capParcel || data.capHistory?.length
        ? buildCapSection(data.capParcel, data.capCode, cxt, data.capHistory ?? [])
        : undefined,
    rotation: buildRotation(data.capParcel, data.capCode, data.capHistory ?? []),
    "crop-context":
      data.crop && data.capCode
        ? buildCropContext(data.crop, data.capCode, data.historicalYields ?? [])
        : undefined,
    water: data.water && data.water.length > 0 ? data.water : undefined,
    surroundings: data.surroundings,
    soil:
      data.soilDepth || data.soilWaterCapacity
        ? buildSoilSection(data.soilDepth, data.soilWaterCapacity, cxt)
        : undefined,
    transactions:
      data.cadastralParcel && data.cadastralParcelPrices
        ? buildTransactionsSection(data.cadastralParcelPrices, cxt)
        : undefined,
    owners:
      data.ownersReadable && data.cadastralParcelOwners && data.cadastralParcelOwners.length > 0
        ? buildOwnersSection(data.cadastralParcelOwners, cxt)
        : undefined,
    // For a caller without a key: the first characters of what a member reads
    "owners-preview":
      !data.ownersReadable && data.cadastralParcelOwners && data.cadastralParcelOwners.length > 0
        ? previewOf(buildOwnersSection(data.cadastralParcelOwners, cxt))
        : undefined,
    // Why no owner is listed: the caller holds no key, or no legal person owns the parcel
    "owners-note": !data.cadastralParcel
      ? undefined
      : !data.ownersReadable
        ? "members-only"
        : data.cadastralParcelOwners?.length === 0
          ? "no-legal-person"
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
    "agricultural-enterprises":
      data.agriculturalEnterprises && data.agriculturalEnterprises.length > 0
        ? buildAgriculturalEnterprisesSection(
            data.agriculturalEnterprises,
            data.subsidiesBySiren ?? new Map(),
            cxt,
          )
        : undefined,
    "msa-populations":
      data.msaPopulations && data.msaPopulations.length > 0
        ? buildMsaPopulationsSection(data.msaPopulations, cxt)
        : undefined,
    "last-year-weather-reports":
      data.weatherStation && data.lastYearWeatherReports
        ? buildWeatherReportsSection(
            data.weatherStation,
            data.lastYearWeatherReports,
            data.historicalDailyWeather,
            cxt,
            legend,
            { until: data.weatherUntil, from: point },
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
  capCodeYear: number | undefined,
  // Owners of parcels are reserved to the holders of a key
  includeOwners: boolean,
): AsyncResult<Error, ParcelData> {
  const wave1 = await Concurrently.run(() =>
    MunicipalityTable(db).select().where("city_shape", "ST_CONTAINS", point).limit(5).run(),
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
    .and(async () => Ok((await zonesAt(db, pointToCoordinates(point))) ?? []))
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

  const municipality =
    municipalities.find((found) => !WHOLE_COMMUNES.includes(found.code)) ??
    municipalities[0]
  const cadastralParcel = cadastralParcels[0]
  const capParcel = capParcels[0]
  const station = stations[0]

  // The reports of a station may stop months ago: the window ends at its latest
  // report, not today, which would show an empty chart
  const weatherUntil = station
    ? await latestReportOf(db, station.reference_name)
    : undefined
  const weatherEnd = weatherUntil ?? new Date()
  const weatherStartDate = new Date(
    weatherEnd.getTime() - WEATHER_WINDOW_DAYS * ONE_DAY_IN_MS,
  ).toISOString()

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
            // Read for everyone: a caller without a key is shown the start of each value only
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

  const historicalWeatherResult = station
    ? await fetchHistoricalDailyWeather(db, station.reference_name, weatherEnd)
    : Ok(undefined)

  const capCodeResult = capParcel?.cap_crop_code
    ? await MasterCapCodeTable(db)
        .select()
        .where("cap_code", "=", capParcel.cap_crop_code)
        .where("year", "=", capCodeYear ?? capParcel.campaign ?? DEFAULT_CAP_CODE_YEAR)
        // A code that also stands for a seed production: the crop itself comes first
        .orderBy("is_seed", "ASC")
        .limit(1)
        .run()
    : Ok([] as MasterCapCode[])

  const capCode = capCodeResult.unwrapOr([])[0]

  const capHistory = ((await cropHistoryAt(db, pointToCoordinates(point))) ?? []).filter(
    (crop) => !crop.current,
  )

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

  const municipalityDependentResult = municipality
    ? await Concurrently.run(() =>
        municipality.code
          ? EnterpriseTable(db)
              .select(
                "establishment_number",
                "siren",
                "name",
                "french_main_activity_code",
                "address",
                "postal_code",
                "city",
              )
              .where("insee_code", "=", municipality.code)
              .where("french_main_activity_code", "LIKE", "01%")
              .orderBy("name", "ASC")
              .run()
          : Ok([] as Enterprise[]),
      )
        .and(() =>
          municipality.code
            ? MsaPopulationTable(db)
                .select()
                .where("insee_code", "=", municipality.code)
                .orderBy("year", "DESC")
                .run()
            : Ok([] as MsaPopulation[]),
        )
        .done()
    : Ok([[] as Enterprise[], [] as MsaPopulation[]] as [Enterprise[], MsaPopulation[]])

  const [agriculturalEnterprises, msaPopulations] = municipalityDependentResult.unwrapOr(
    [[] as Enterprise[], [] as MsaPopulation[]],
  )

  const coordinates = pointToCoordinates(point)
  const [water, buildings, surroundings, crop] = await Promise.all([
    waterNear(db, { ...coordinates, parcelId: cadastralParcel?.id }),
    cadastralParcel ? buildingsOn(db, cadastralParcel.id) : undefined,
    cadastralParcel ? surroundingsOf(db, cadastralParcel.id) : undefined,
    capCode?.production ? cropContext(db, capCode.production, department) : undefined,
  ])

  const subsidiesResult = await fetchSubsidiesBySiren(
    db,
    agriculturalEnterprises.flatMap((e) => (e.siren ? [e.siren] : [])),
  )
  const subsidiesBySiren = subsidiesResult.unwrapOr(new Map())

  const [cadastralParcelPrices, cadastralParcelOwners] =
    cadastreDependentResult.unwrapOr([undefined, undefined])
  const lastYearWeatherReports = weatherResult.unwrapOr(undefined)
  const historicalDailyWeather = historicalWeatherResult.unwrapOr(undefined)
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
    capHistory,
    ownersReadable: includeOwners,
    naturalZones,
    protectedWaterZones,
    areaItems,
    soilDepth: soilDepths[0],
    soilWaterCapacity: soilWaterCapacities[0],
    weatherStation: station,
    weatherUntil,
    lastYearWeatherReports,
    historicalDailyWeather,
    historicalYields,
    productionPrices,
    water,
    buildings,
    surroundings,
    crop,
    department,
    agriculturalEnterprises,
    subsidiesBySiren,
    msaPopulations,
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

function buildLinksSection(
  municipality: Municipality,
  cxt: Context,
): Record<string, HypermediaType["Link"]> {
  return {
    "cap-parcels-map": Hypermedia.Link({
      label: cxt.t("tools_parcel_identifier_links_cap_parcels_map"),
      value: cxt.t("tools_parcel_identifier_links_cap_parcels_map"),
      method: "GET",
      href:
        "/geographical-references/cap-parcels/map?city=" +
        encodeURIComponent(municipality.city_name),
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
  capParcel: CapParcel | undefined,
  capCode: MasterCapCode | undefined,
  cxt: Context,
  history: CropOfCampaign[],
): Record<string, Hypermedia> {
  const section: Record<string, Hypermedia> = capParcel
    ? {
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
    : {}

  // The place was declared in earlier campaigns, whatever it is today
  history.forEach((crop) => {
    section[`culture-${crop.campaign}`] = Hypermedia.Text({
      label: `${cxt.t("geographical_references_cap_parcel_culture")} ${crop.campaign}`,
      value: [crop.crop, crop["crop-code"]].filter(Boolean).join(" — "),
    })
  })

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

/**
 * What was grown at the point, campaign after campaign, oldest first: the latest
 * declaration, then the ones of the place in earlier campaigns.
 */
function buildRotation(
  capParcel: CapParcel | undefined,
  capCode: MasterCapCode | undefined,
  history: CropOfCampaign[],
): NonNullable<ParcelIdentifierOkPage["rotation"]> | undefined {
  const past = history.map((crop) => ({
    campaign: crop.campaign,
    crop: crop.crop ?? crop["crop-code"] ?? "",
    code: crop["crop-code"] ?? "",
    current: false,
  }))
  const latest = Math.max(0, ...past.map((crop) => crop.campaign))
  const current = capParcel
    ? [
        {
          campaign: capParcel.campaign ?? capCode?.year ?? latest + 1,
          crop: capCode?.cap_label ?? capParcel.cap_crop_code ?? "",
          code: capParcel.cap_crop_code ?? "",
          current: true,
        },
      ]
    : []
  const rotation = [...past, ...current].sort((a, b) => a.campaign - b.campaign)

  return rotation.length > 0 ? rotation : undefined
}

// Where to read more about the crop of the parcel: each figure comes with the
// page that lists what it counts
function buildCropContext(
  crop: CropContext,
  capCode: MasterCapCode,
  yields: ProductionYield[],
): NonNullable<ParcelIdentifierOkPage["crop-context"]> {
  const latestYield = yields
    .filter((found) => found.production === crop.production)
    .sort((a, b) => b.campaign - a.campaign)[0]
  const harvest = latestYield
    ? { value: parseFloat(latestYield.yield_value as any), unit: latestYield.yield_unit }
    : undefined
  const grossProduct = grossProductOf(harvest, crop.price)

  return {
    production: crop.production,
    label: capCode.cap_label,
    price: crop.price,
    "gross-product":
      grossProduct !== undefined && harvest && latestYield && crop.price
        ? {
            value: grossProduct,
            unit: "EUR/ha",
            yield: harvest.value,
            "yield-campaign": latestYield.campaign,
            "price-campaign": crop.price.campaign,
          }
        : undefined,
    usages: crop.usages
      ? {
          ...crop.usages,
          href:
            "/phytosanitary/usages?state=authorized&crop=" +
            encodeURIComponent(crop.usages.crop),
        }
      : undefined,
    documents: crop.documents
      ? {
          area: crop.documents.area,
          total: crop.documents.total,
          href:
            "/rd-agri/documents?production=" +
            encodeURIComponent(crop.production) +
            `&area-kind=${crop.documents.area.kind}&area-code=` +
            encodeURIComponent(crop.documents.area.code),
          latest: crop.documents.latest.map((document) => ({
            ...document,
            href: "/rd-agri/documents/" + encodeURIComponent(document.id),
          })),
        }
      : undefined,
    workflows:
      crop.workflows.length > 0
        ? {
            count: crop.workflows.length,
            href:
              "/production/technical-workflows?production=" +
              encodeURIComponent(crop.production),
          }
        : undefined,
  }
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
      price: Hypermedia.Number({
        label: cxt.t("tools_price"),
        value: parseFloat(price.cadastral_price as any),
        unit: "€",
      }),
    })),
  }
}

// How much of a reserved value leaves the server for a caller without a key
const PREVIEW_LENGTH = 2

export type ReservedPreview = {
  label: string
  columns: Record<string, string>
  // The first characters of each value; the rest never leaves the server
  rows: Record<string, string>[]
}

function previewOf(section: TableSection): ReservedPreview {
  return {
    label: section.label,
    columns: section.columns,
    rows: section.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).flatMap(([field, cell]) => {
          const value = (cell as { value?: unknown } | undefined)?.value

          return value === undefined || value === null
            ? []
            : [[field, String(value).slice(0, PREVIEW_LENGTH)]]
        }),
      ),
    ),
  }
}

// The file has one line per fiscal subdivision of the parcel: an owner is listed once
const distinctOwners = (owners: EnrichedParcelOwner[]) => [
  ...new Map(
    owners.map((owner) => [owner.majic_number + "|" + owner.department_code, owner]),
  ).values(),
]

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
    },
    rows: distinctOwners(owners).map((owner) => ({
      denomination:
        owner.denomination && isNameable(owner)
          ? Hypermedia.Text({
              label: cxt.t("tools_owner_denomination"),
              value: owner.denomination,
            })
          : owner.person_group_label
            ? Hypermedia.Text({
                label: cxt.t("tools_owner_denomination"),
                value: owner.person_group_label,
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

function buildAreaItemsSection(items: ZoneAtPoint[], cxt: Context): TableSection {
  return {
    label: cxt.t("tools_area_items"),
    columns: {
      name: cxt.t("common_fields_name"),
      nature: cxt.t("tools_zone_nature"),
    },
    rows: items.map((item) => ({
      name: item.name
        ? Hypermedia.Text({ label: cxt.t("common_fields_name"), value: item.name })
        : undefined,
      // What the IGN calls it, or the family it belongs to when it says no more
      nature: Hypermedia.Text({
        label: cxt.t("tools_zone_nature"),
        value: item.kind ?? cxt.t("tools_area_" + item.nature),
      }),
    })),
  }
}

// The leaf of the logo, the colour of the crops
const YIELD_CHART_COLOR = "#2f8f89"

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

function buildAgriculturalEnterprisesSection(
  enterprises: Enterprise[],
  subsidiesBySiren: Map<string, CapSubsidy[]>,
  cxt: Context,
): TableSection {
  return {
    label: cxt.t("tools_agricultural_enterprises"),
    columns: {
      siren: cxt.t("tools_enterprise_siren"),
      activity: cxt.t("tools_enterprise_activity_code"),
      "subsidy-count": cxt.t("tools_subsidies_count"),
      "subsidy-amount": cxt.t("tools_subsidies_total_amount"),
      "subsidy-year": cxt.t("tools_subsidies_year"),
    },
    rows: enterprises.map((enterprise) => {
      const subsidies = enterprise.siren
        ? subsidiesBySiren.get(enterprise.siren) ?? []
        : []
      // Amounts of different years are never added up: the latest year is shown
      const latest = subsidiesByYear(subsidies)[0]
      return {
        siren: enterprise.siren
          ? Hypermedia.Link({
              label: cxt.t("tools_enterprise_siren"),
              value: enterprise.siren,
              method: "GET",
              href: "/enterprises/enterprises/" + enterprise.siren,
            })
          : undefined,
        activity: Hypermedia.Text({
          label: cxt.t("tools_enterprise_activity_code"),
          value: enterprise.french_main_activity_code,
        }),
        "subsidy-count": Hypermedia.Number({
          label: cxt.t("tools_subsidies_count"),
          value: latest?.count ?? 0,
        }),
        "subsidy-amount": latest
          ? Hypermedia.Number({
              label: cxt.t("tools_subsidies_total_amount"),
              value: latest.total,
              unit: "€",
            })
          : undefined,
        "subsidy-year": latest
          ? Hypermedia.Number({
              label: cxt.t("tools_subsidies_year"),
              value: latest.year,
            })
          : undefined,
      }
    }),
  }
}

function buildMsaPopulationsSection(
  populations: MsaPopulation[],
  cxt: Context,
): TableSection {
  return {
    label: cxt.t("tools_msa_populations"),
    columns: {
      year: cxt.t("tools_msa_year"),
      "new-contracts": cxt.t("tools_msa_new_contracts"),
      "farm-chiefs": cxt.t("tools_msa_farm_chiefs"),
      "retired-salaried": cxt.t("tools_msa_retired_salaried"),
      "retired-non-salaried": cxt.t("tools_msa_retired_non_salaried"),
    },
    rows: populations.map((p) => ({
      year: Hypermedia.Number({
        label: cxt.t("tools_msa_year"),
        value: p.year,
      }),
      "new-contracts":
        p.new_contracts !== null && p.new_contracts !== undefined
          ? Hypermedia.Number({
              label: cxt.t("tools_msa_new_contracts"),
              value: p.new_contracts,
            })
          : undefined,
      "farm-chiefs":
        p.farm_chiefs !== null && p.farm_chiefs !== undefined
          ? Hypermedia.Number({
              label: cxt.t("tools_msa_farm_chiefs"),
              value: p.farm_chiefs,
            })
          : undefined,
      "retired-salaried":
        p.retired_salaried !== null && p.retired_salaried !== undefined
          ? Hypermedia.Number({
              label: cxt.t("tools_msa_retired_salaried"),
              value: p.retired_salaried,
            })
          : undefined,
      "retired-non-salaried":
        p.retired_non_salaried !== null && p.retired_non_salaried !== undefined
          ? Hypermedia.Number({
              label: cxt.t("tools_msa_retired_non_salaried"),
              value: p.retired_non_salaried,
            })
          : undefined,
    })),
  }
}

async function latestReportOf(db: Pool, stationId: string): Promise<Date | undefined> {
  const schema = import.meta.env.DB_SCHEMA

  return db
    .query(
      `SELECT max(started_at) AS latest FROM "${schema}".registered_hourly_weathers WHERE station_id = $1`,
      [stationId],
    )
    .then((result) => (result.rows[0]?.latest ? new Date(result.rows[0].latest) : undefined))
    .catch(() => undefined)
}

// Great-circle distance, enough to say how far a station is
function kilometersBetween(a: Point, b: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const [lonA, latA] = a.coordinates
  const [lonB, latB] = b.coordinates
  const h =
    Math.sin(radians(latB - latA) / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(radians(lonB - lonA) / 2) ** 2

  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

async function fetchHistoricalDailyWeather(
  db: Pool,
  stationId: string,
  until: Date,
): AsyncResult<Error, HistoricalDailyAggregate[]> {
  const schema = import.meta.env.DB_SCHEMA
  const q = `
    SELECT
      EXTRACT(MONTH FROM day)::int AS month,
      EXTRACT(DAY FROM day)::int AS day,
      AVG(daily_max_temp)::float AS avg_max_temp,
      AVG(daily_rain)::float AS avg_rain
    FROM (
      SELECT
        DATE_TRUNC('day', started_at) AS day,
        MAX(max_temp) AS daily_max_temp,
        SUM(COALESCE(rain, 0)) AS daily_rain
      FROM "${schema}".registered_hourly_weathers
      WHERE station_id = $1
        AND started_at >= $2::timestamptz - INTERVAL '${WEATHER_HISTORY_YEARS} years'
        AND started_at < $2::timestamptz - INTERVAL '${WEATHER_WINDOW_DAYS} days'
      GROUP BY day
    ) daily
    GROUP BY month, day
  `
  try {
    const result = await db.query(q, [stationId, until.toISOString()])
    return Ok(result.rows as HistoricalDailyAggregate[])
  } catch (e) {
    return Err(e as Error)
  }
}

function buildWeatherReportsSection(
  station: Station,
  reports: ParcelData["lastYearWeatherReports"] & {},
  historical: HistoricalDailyAggregate[] | undefined,
  cxt: Context,
  legend: any,
  place: { until: Date | undefined; from: Point },
) {
  // Aggregate current 30-day window by day: daily max temp + daily rain sum.
  type DayAcc = {
    date: Date
    max_temp: number
    rain: number
    has_max: boolean
    has_rain: boolean
  }
  const dayAccs = new Map<string, DayAcc>()
  for (const r of reports) {
    const d = new Date(r.started_at)
    const dayKey = d.toISOString().slice(0, 10)
    let acc = dayAccs.get(dayKey)
    if (!acc) {
      const date = new Date(dayKey + "T00:00:00Z")
      acc = { date, max_temp: -Infinity, rain: 0, has_max: false, has_rain: false }
      dayAccs.set(dayKey, acc)
    }
    const mt = parseFloat(r.max_temp as any)
    if (!Number.isNaN(mt)) {
      acc.max_temp = Math.max(acc.max_temp, mt)
      acc.has_max = true
    }
    const rn = parseFloat(r.rain as any)
    if (!Number.isNaN(rn)) {
      acc.rain += rn
      acc.has_rain = true
    }
  }

  const historicalByKey = new Map<string, HistoricalDailyAggregate>()
  for (const h of historical ?? []) {
    historicalByKey.set(`${h.month}-${h.day}`, h)
  }

  const sortedDays = Array.from(dayAccs.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )

  type Row = {
    "temperature-max"?: number
    "temperature-max-avg"?: number
    rain?: number
    "rain-avg"?: number
  }
  const values: Record<string, Row> = {}
  for (const acc of sortedDays) {
    const monthDay = `${acc.date.getUTCMonth() + 1}-${acc.date.getUTCDate()}`
    const hist = historicalByKey.get(monthDay)
    const row: Row = {}
    if (acc.has_max) row["temperature-max"] = Number(acc.max_temp.toFixed(1))
    if (acc.has_rain) row.rain = Number(acc.rain.toFixed(1))
    if (hist?.avg_max_temp != null) {
      row["temperature-max-avg"] = Number(Number(hist.avg_max_temp).toFixed(1))
    }
    if (hist?.avg_rain != null) {
      row["rain-avg"] = Number(Number(hist.avg_rain).toFixed(1))
    }
    values[cxt.dateTimeFormatter.Date(acc.date)] = row
  }

  return {
    station: Hypermedia.Link({
      label: cxt.t("weather_station"),
      value: station.station_name + " " + station.station_code,
      method: "GET",
      href: "/weather/stations/" + station.reference_name,
    }),
    // How far the station is, and when its reports stop: they are not always of yesterday
    distance: Hypermedia.Number({
      label: cxt.t("tools_station_distance"),
      value: Math.round(kilometersBetween(place.from, station.centroid)),
      unit: "km",
    }),
    until: place.until
      ? Hypermedia.Date({
          label: cxt.t("tools_station_until"),
          value: cxt.dateTimeFormatter.Date(place.until),
          iso: place.until.toISOString(),
        })
      : undefined,
    legend,
    values,
  }
}
