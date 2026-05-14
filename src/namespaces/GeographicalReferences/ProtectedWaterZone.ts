import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface ProtectedWaterZone {
  id: string
  administrative_zone?: string
  creator_name?: string
  name?: string
  updated_on?: Date
  shape: MultiPolygon
  centroid?: Point
}

export const ProtectedWaterZoneTable = Table<ProtectedWaterZone>({
  table: "registered_protected_water_zones",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
