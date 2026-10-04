import type { Pool } from "pg"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type Db = Pick<Pool, "query">

// The parcels declared to the CAP are kept campaign by campaign:
// registered_graphic_parcels holds the latest one, registered_graphic_parcels_history
// the ones before. A parcel has no identity across campaigns, only a place.

export type CropOfCampaign = Readonly<{
  campaign: number
  "parcel-id": string
  "crop-code": string | null
  crop: string | null
  current: boolean
}>

export type Coordinates = Readonly<{ longitude: number; latitude: number }>

/**
 * The point a request speaks of, when it is one on Earth.
 */
export function coordinatesOf(input: {
  longitude?: unknown
  latitude?: unknown
}): Coordinates | undefined {
  const longitude = Number(input.longitude)
  const latitude = Number(input.latitude)
  const isGiven = (value: unknown) =>
    value !== undefined && value !== null && value !== ""

  return isGiven(input.longitude) &&
    isGiven(input.latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
    ? { longitude, latitude }
    : undefined
}

export function cropOf(row: Record<string, any>): CropOfCampaign {
  return {
    campaign: row.campaign,
    "parcel-id": row.id,
    "crop-code": row.cap_crop_code,
    crop: row.cap_label,
    current: row.current,
  }
}

const parcelsAt = (table: string, current: boolean) =>
  `SELECT campaign, id, cap_crop_code, ${current} AS current
     FROM "${DB_SCHEMA}".${table}
    WHERE postgis.ST_Contains(shape, postgis.ST_SetSRID(postgis.ST_Point($1, $2), 4326))`

// The label of a crop code changes with the years: the one of the campaign is taken
const labelled = (parcels: string) =>
  `SELECT parcel.campaign, parcel.id, parcel.cap_crop_code, parcel.current,
          (SELECT code.cap_label
             FROM "${DB_SCHEMA}".master_crop_production_cap_codes AS code
            WHERE code.cap_code = parcel.cap_crop_code AND code.year = parcel.campaign
            LIMIT 1) AS cap_label
     FROM (${parcels}) AS parcel
    ORDER BY parcel.campaign DESC, parcel.id;`

/**
 * What was declared at a point, campaign after campaign, latest first.
 *
 * @returns undefined when the parcels are not in service. Where the history is
 *   left out, as in a light bundle, only the latest campaign is known.
 */
export async function cropHistoryAt(
  db: Db,
  point: Coordinates,
): Promise<CropOfCampaign[] | undefined> {
  const values = [point.longitude, point.latitude]
  const run = (sql: string) =>
    db.query(labelled(sql), values).then((result) => result.rows.map(cropOf))

  return run(
    `${parcelsAt("registered_graphic_parcels", true)}
     UNION ALL
     ${parcelsAt("registered_graphic_parcels_history", false)}`,
  ).catch(() =>
    // The history may be left out of what is loaded
    run(parcelsAt("registered_graphic_parcels", true)).catch(() => undefined),
  )
}
