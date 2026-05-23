import type { Pool } from "pg"
import { Err, Ok, type AsyncResult } from "shulk"
import { Table } from "../Database"
import type { Point } from "../types/Geometry"

export interface Enterprise {
  establishment_number: string
  french_main_activity_code: string
  name?: string
  address?: string
  postal_code?: string
  insee_code?: string
  city?: string
  country?: string
  siren?: string
  centroid?: Point
}

export const EnterpriseTable = Table<Enterprise>({
  table: "registered_enterprises",
  primaryKey: "establishment_number",
  geometry: ["centroid"],
})

export interface CapSubsidy {
  id: number
  siren: string
  year: number
  intervention_code: string
  intervention_label?: string
  intervention_objective?: string
  intervention_start_date?: Date
  intervention_end_date?: Date
  feaga_amount?: string
  feader_amount?: string
  cofinanced_amount?: string
}

export const CapSubsidyTable = Table<CapSubsidy>({
  table: "registered_cap_subsidies",
  primaryKey: "id",
})

const DB_SCHEMA = import.meta.env.DB_SCHEMA

export async function fetchSubsidiesBySiren(
  db: Pool,
  sirens: string[],
): AsyncResult<Error, Map<string, CapSubsidy[]>> {
  const unique = [...new Set(sirens.filter((s) => s && s.length > 0))]

  if (unique.length === 0) {
    return Ok(new Map())
  }

  const placeholders = unique.map((_, i) => `$${i + 1}`).join(", ")
  const q = `SELECT id, siren, year, intervention_code, intervention_label,
                    intervention_objective, intervention_start_date, intervention_end_date,
                    feaga_amount, feader_amount, cofinanced_amount
             FROM "${DB_SCHEMA}".registered_cap_subsidies
             WHERE siren IN (${placeholders})
             ORDER BY year DESC, siren ASC;`

  try {
    const response = await db.query<CapSubsidy>(q, unique)
    const bySiren = new Map<string, CapSubsidy[]>()
    for (const row of response.rows) {
      const existing = bySiren.get(row.siren)
      if (existing) {
        existing.push(row)
      } else {
        bySiren.set(row.siren, [row])
      }
    }
    return Ok(bySiren)
  } catch (e) {
    return Err(e as Error)
  }
}
