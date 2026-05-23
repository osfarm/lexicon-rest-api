import { Table } from "../Database"

export interface MsaPopulation {
  id: number
  insee_code: string
  city_name?: string
  year: number
  new_contracts?: number
  farm_chiefs?: number
  retired_non_salaried?: number
  retired_salaried?: number
}

export const MsaPopulationTable = Table<MsaPopulation>({
  table: "registered_msa_populations",
  primaryKey: "id",
})
