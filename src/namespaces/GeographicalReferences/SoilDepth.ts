import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface SoilDepth {
  id: string
  soil_depth_value?: number
  soil_depth_unit?: string
  shape: MultiPolygon
  centroid?: Point
}

export const SoilDepthTable = Table<SoilDepth>({
  table: "registered_soil_depths",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
