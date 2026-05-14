import { Table } from "../../Database"

export interface MasterCapCode {
  cap_code: string
  cap_label: string
  production: string
  cap_precision?: string
  cap_category?: string
  is_seed?: boolean
  year: number
}

// Note: the real PK is composite (cap_code, production, year); the Table<T>
// abstraction only supports a single primaryKey, so always interrogate this
// table with .where("cap_code", "=", X).where("year", "=", Y) to disambiguate.
export const MasterCapCodeTable = Table<MasterCapCode>({
  table: "master_crop_production_cap_codes",
  primaryKey: "cap_code",
})
