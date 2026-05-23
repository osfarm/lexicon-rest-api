import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface SoilAvailableWaterCapacity {
  id: string
  available_water_reference_value?: number
  available_water_min_value?: number
  available_water_max_value?: number
  available_water_unit?: string
  available_water_label?: string
  shape: MultiPolygon
  centroid?: Point
}

export const SoilAvailableWaterCapacityTable = Table<SoilAvailableWaterCapacity>({
  table: "registered_soil_available_water_capacities",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
