import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface HydrographicItem {
  id: string
  name?: Record<string, string>
  nature?: string
  point?: Point
  shape?: MultiPolygon
  centroid?: Point
}

export const HydrographicItemTable = Table<HydrographicItem>({
  table: "registered_hydrographic_items",
  primaryKey: "id",
  geometry: ["shape", "centroid", "point"],
})
