import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface AreaItem {
  id: string
  name?: Record<string, string>
  nature?: string
  point?: Point
  shape?: MultiPolygon
  centroid?: Point
}

export const AreaItemTable = Table<AreaItem>({
  table: "registered_area_items",
  primaryKey: "id",
  geometry: ["shape", "centroid", "point"],
})
