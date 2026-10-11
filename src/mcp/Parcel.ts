import { compact } from "./Compact"

// The page of the parcel identifier, cut down to what answers a question about
// a place: lists become counts, charts become their latest figures.

type Json = unknown
type Page = Record<string, any>

const isObject = (value: Json): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const rowsOf = (section: Json): Record<string, any>[] =>
  isObject(section) && Array.isArray(section.rows) ? section.rows : []

const listOf = (section: Json) => rowsOf(section).map((row) => compact(row))

function weatherOf(weather: Json) {
  if (!isObject(weather)) {
    return undefined
  }

  const days = Object.values(isObject(weather.values) ? weather.values : {}) as Record<
    string,
    number | null
  >[]
  const numbers = (key: string) =>
    days.map((day) => day[key]).filter((value): value is number => typeof value === "number")
  const sum = (values: number[]) =>
    Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10
  const mean = (values: number[]) =>
    values.length > 0 ? Math.round((sum(values) / values.length) * 10) / 10 : undefined

  return {
    station: compact(weather.station),
    "station-distance": compact(weather.distance),
    "latest-report": compact(weather.until),
    "days-reported": days.length,
    "rain-total-mm": sum(numbers("rain")),
    "rain-ten-year-average-mm": sum(numbers("rain-avg")),
    "max-temperature-mean-celsius": mean(numbers("temperature-max")),
    "max-temperature-ten-year-mean-celsius": mean(numbers("temperature-max-avg")),
  }
}

function yieldsOf(yields: Json) {
  if (!isObject(yields) || !isObject(yields.values)) {
    return undefined
  }

  return {
    production: compact(yields.production),
    unit: compact(yields.unit),
    "by-campaign": Object.fromEntries(
      Object.entries(yields.values).map(([campaign, value]) => [
        campaign,
        (value as { yield?: number }).yield,
      ]),
    ),
  }
}

function farmsOf(enterprises: Json) {
  const rows = rowsOf(enterprises)

  return rows.length === 0
    ? undefined
    : {
        "agricultural-establishments": rows.length,
        "with-cap-subsidies": rows.filter(
          (row) => Number((row["subsidy-count"] as { value?: number })?.value) > 0,
        ).length,
        meaning: "Establishments of the commune whose activity code starts with 01",
      }
}

type Surroundings = {
  dwellings?: { within: number; count: number; nearest?: number }
  hedges?: number
  vegetation?: { nature: string; area: number; share: number; distance: number }[]
  "sensitive-sites"?: { kind: string; name?: string; distance: number }[]
  "power-lines"?: { voltage: string; distance: number }[]
}

// Each figure named with its unit, so that none is read for another
function surroundingsOf(around: Json) {
  if (around === undefined || around === null) {
    return undefined
  }

  const { dwellings, hedges, vegetation = [] } = around as Surroundings
  const sites = (around as Surroundings)["sensitive-sites"] ?? []
  const lines = (around as Surroundings)["power-lines"] ?? []

  return {
    ...(dwellings
      ? {
          [`dwellings-within-${dwellings.within}-metres`]: dwellings.count,
          "nearest-dwelling-metres": dwellings.nearest ?? "none within 500 metres",
        }
      : {}),
    ...(hedges !== undefined ? { "hedge-metres-on-or-along-the-parcel": hedges } : {}),
    vegetation: vegetation.map((item) =>
      item.area > 0
        ? {
            nature: item.nature,
            "square-metres-on-the-parcel": item.area,
            "percent-of-the-parcel": item.share,
          }
        : { nature: item.nature, "distance-metres": item.distance },
    ),
    // Schools, hospitals, homes for the elderly: treatments are restricted near them
    "sensitive-sites-within-500-metres": sites.map((site) => ({
      kind: site.kind,
      name: site.name,
      "distance-metres": site.distance,
    })),
    "high-voltage-lines-within-100-metres": lines.map((line) => ({
      voltage: line.voltage,
      "distance-metres": line.distance,
    })),
  }
}

/**
 * What the datasets know at a point, short enough to be read in one go.
 */
export function parcelSummaryOf(page: Page) {
  const zones = [
    ...listOf(page["natural-zones"]),
    ...listOf(page["protected-water-zones"]),
    ...listOf(page["area-items"]),
  ]
  const summary = {
    point: page.point,
    commune: compact(page.information),
    "cadastral-parcel": compact(page.cadastre),
    "cap-parcel": compact(page.cap),
    "crop-rotation": page.rotation,
    "about-the-crop": page["crop-context"],
    "department-yields": yieldsOf(page["historical-yields"]),
    soil: compact(page.soil),
    // water-police "Inscrit" = a watercourse for the water police; permanent false = intermittent
    "water-near-the-parcel-metres": page.water,
    "around-the-parcel": surroundingsOf(page.surroundings),
    zonings: zones.length > 0 ? zones : "none at this point",
    // PAT covering the commune; farms and organic share are those of the whole project
    "territorial-food-projects":
      Array.isArray(page["food-projects"]) && page["food-projects"].length === 0
        ? "none covers this commune"
        : page["food-projects"],
    "land-transactions": listOf(page.transactions),
    owners:
      page["owners-note"] === "members-only"
        ? "reserved to the holders of a member key"
        : page["owners-note"] === "no-legal-person"
          ? "no company nor public body among the owners: private persons, whom Lexicon does not name"
          : listOf(page.owners),
    "weather-last-30-days": weatherOf(page["last-year-weather-reports"]),
    farms: farmsOf(page["agricultural-enterprises"]),
    "farm-chiefs-msa": listOf(page["msa-populations"])[0],
  }

  return Object.fromEntries(
    Object.entries(summary).filter(
      ([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0),
    ),
  )
}
