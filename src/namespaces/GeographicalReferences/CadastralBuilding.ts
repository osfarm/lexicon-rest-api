import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface CadastralBuilding {
  id: number
  reference_name?: string
  nature?: string
  shape: MultiPolygon
  centroid?: Point
}

export const CadastralBuildingTable = Table<CadastralBuilding>({
  table: "registered_cadastral_buildings",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
