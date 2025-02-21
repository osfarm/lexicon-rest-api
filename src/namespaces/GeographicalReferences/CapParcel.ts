import { Table } from "../../Database"
import type { Point, Polygon } from "../../types/Geometry"

interface CapParcel {
  id: string
  cap_crop_code: CapCode
  city_name: string
  shape: Polygon
  centroid: Point
  // CAP Code properties
  cap_code: string
  cap_label: string
  production: string
  cap_precision?: string
  cap_category?: string
  is_seed: boolean
  year: number
}
type CapCode = string

export const CapParcelTable = Table<CapParcel>({
  table: "registered_graphic_parcels",
  primaryKey: "id",
  oneToOne: {
    cap_crop_code: {
      table: "master_crop_production_cap_codes",
      primaryKey: "cap_code",
    },
  },
  geometry: ["centroid", "shape"],
})
