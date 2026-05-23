import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface NaturalZone {
  id: string
  name?: string
  nature: string
  shape: MultiPolygon
  centroid?: Point
}

export const NaturalZoneTable = Table<NaturalZone>({
  table: "registered_natural_zones",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
