import { Table } from "../../Database"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface Parcel {
  id: string
  town_insee_code: string
  section_prefix: string
  section: string
  work_number: string
  net_surface_area: number
  shape: MultiPolygon
  centroid: Point
}

export const ParcelTable = Table<Parcel>({
  table: "registered_cadastral_parcels",
  primaryKey: "id",
  geometry: ["shape", "centroid"],
})
