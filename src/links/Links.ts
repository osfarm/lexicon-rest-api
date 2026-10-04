import type { Pool } from "pg"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type Db = Pick<Pool, "query">

export type CommuneLink = Readonly<{
  "insee-code": string
  name: string
  "postal-codes": string[]
  "department-code": string | null
  "region-code": string | null
  cadastre: {
    parcels: number
    "area-m2": number
    "parcels-with-agricultural-owner": number
  }
  "agricultural-enterprises": number
  msa: { year: number; "farm-chiefs": number | null } | null
  "weather-station": string | null
  links: Record<string, string>
}>

export type EnterpriseLink = Readonly<{
  siren: string
  name: string | null
  "legal-form": string | null
  cadastre: { parcels: number; "area-m2": number; communes: number }
  establishments: { count: number; "main-activity-code": string | null }
  cap: { year: number; total: number } | null
  links: Record<string, string>
}>

const INSEE_CODE = /^[0-9][0-9AB][0-9]{3}$/
const SIREN = /^[0-9]{9}$/

export const isInseeCode = (value: string) => INSEE_CODE.test(value)
export const isSiren = (value: string) => SIREN.test(value)

/**
 * The pre-joined record of a commune, in the shape the API publishes.
 */
export function communeLinkOf(row: Record<string, any>): CommuneLink {
  return {
    "insee-code": row.insee_code,
    name: row.name,
    "postal-codes": row.postal_codes,
    "department-code": row.department_code,
    "region-code": row.region_code,
    cadastre: {
      parcels: row.cadastral_parcels_count,
      "area-m2": Number(row.cadastral_area_m2),
      "parcels-with-agricultural-owner": row.agricultural_owner_parcels_count,
    },
    "agricultural-enterprises": row.enterprises_count,
    msa:
      row.msa_year === null
        ? null
        : { year: row.msa_year, "farm-chiefs": row.msa_farm_chiefs },
    "weather-station": row.weather_station,
    links: row.weather_station
      ? { "weather-station": `/weather/stations/${row.weather_station}` }
      : {},
  }
}

/**
 * The pre-joined record of a company. Only legal entities have one.
 */
export function enterpriseLinkOf(row: Record<string, any>): EnterpriseLink {
  return {
    siren: row.siren,
    name: row.name,
    "legal-form": row.legal_form,
    cadastre: {
      parcels: row.owned_parcels_count,
      "area-m2": Number(row.owned_area_m2),
      communes: row.owned_communes_count,
    },
    establishments: {
      count: row.establishments_count,
      "main-activity-code": row.main_activity_code,
    },
    cap:
      row.cap_year === null ? null : { year: row.cap_year, total: Number(row.cap_total) },
    links:
      row.establishments_count > 0
        ? { enterprise: `/enterprises/enterprises/${row.siren}` }
        : {},
  }
}

/**
 * @returns the row, null when there is none, undefined when the links are not in service
 */
async function readRow(db: Db, table: string, column: string, value: string) {
  return db
    .query(`SELECT * FROM "${DB_SCHEMA}".${table} WHERE ${column} = $1 LIMIT 1;`, [value])
    .then(
      (result) => (result.rows[0] as Record<string, any> | undefined) ?? null,
      () => undefined,
    )
}

export const readCommuneLink = (db: Db, inseeCode: string) =>
  readRow(db, "link_communes", "insee_code", inseeCode)

export const readEnterpriseLink = (db: Db, siren: string) =>
  readRow(db, "link_enterprises", "siren", siren)
