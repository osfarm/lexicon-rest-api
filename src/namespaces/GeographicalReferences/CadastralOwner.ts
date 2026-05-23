import type { Pool } from "pg"
import { Err, Ok, type AsyncResult } from "shulk"
import { Table } from "../../Database"

export interface CadastralOwner {
  majic_number: string
  department_code: string
  siren?: string
  denomination?: string
  legal_form_code?: string
  legal_form_short?: string
  person_group_code?: string
  person_group_label?: string
}

// The real PK is composite (majic_number, department_code) — Table<T> only
// stores one field for primaryKey, but no consumer of this table relies on
// `.read()` so leaving it on `majic_number` is harmless. All accesses go
// through `.select().where(...).where(...)` or via fetchOwnersByMajicDept.
export const CadastralOwnerTable = Table<CadastralOwner>({
  table: "registered_cadastral_owners",
  primaryKey: "majic_number",
})

const DB_SCHEMA = import.meta.env.DB_SCHEMA

// Resolves a batch of (majic_number, department_code) pairs in a single query
// and returns a map keyed by `${majic}|${dept}`. Used to replace the previous
// `oneToOne` LEFT JOIN, which is no longer correct now that the owners table
// has a composite PK.
export async function fetchOwnersByMajicDept(
  db: Pool,
  pairs: Array<{ majic_number: string; department_code: string }>,
): AsyncResult<Error, Map<string, CadastralOwner>> {
  const dedup = new Map<string, { majic_number: string; department_code: string }>()
  for (const p of pairs) {
    dedup.set(`${p.majic_number}|${p.department_code}`, p)
  }
  const unique = [...dedup.values()]

  if (unique.length === 0) {
    return Ok(new Map())
  }

  const placeholders = unique
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
    .join(", ")
  const params = unique.flatMap((p) => [p.majic_number, p.department_code])

  const q = `SELECT majic_number, department_code, siren, denomination, legal_form_code, legal_form_short, person_group_code, person_group_label
             FROM "${DB_SCHEMA}".registered_cadastral_owners
             WHERE (majic_number, department_code) IN (${placeholders});`

  try {
    const response = await db.query<CadastralOwner>(q, params)
    const byKey = new Map<string, CadastralOwner>()
    for (const row of response.rows) {
      byKey.set(`${row.majic_number}|${row.department_code}`, row)
    }
    return Ok(byKey)
  } catch (e) {
    return Err(e as Error)
  }
}
