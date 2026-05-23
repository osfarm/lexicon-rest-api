import { Table } from "../../Database"

export interface CadastralParcelOwner {
  id: number
  cadastral_parcel_id: string
  town_insee_code: string
  department_code: string
  section_prefix?: string
  section?: string
  work_number?: string
  parcel_surface_area?: number
  suf?: string
  culture_nature_code?: string
  suf_surface_area?: number
  address?: string
  street_rivoli_code?: string
  droit_code?: string
  majic_number: string
  siren?: string
}

// No oneToOne join: the owners table now has a composite PK
// (majic_number, department_code) which the single-key `oneToOne`
// mechanism cannot express. Owner enrichment is done in the controller
// via fetchOwnersByMajicDept (see CadastralOwner.ts).
export const CadastralParcelOwnerTable = Table<CadastralParcelOwner>({
  table: "registered_cadastral_parcel_owners",
  primaryKey: "id",
})
