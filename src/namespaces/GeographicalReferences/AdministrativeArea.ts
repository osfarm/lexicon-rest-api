import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface AdministrativeArea {
  kind: "region" | "department"
  code: string
  name: string
  parent_code?: string
  shape: MultiPolygon
  centroid?: Point
}

export const AdministrativeAreaTable = Table<AdministrativeArea>({
  table: "registered_administrative_areas",
  primaryKey: "code",
  geometry: ["shape", "centroid"],
})
