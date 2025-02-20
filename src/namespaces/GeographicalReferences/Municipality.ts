import { Table } from "../../Database"
import type { Country } from "../../types/Country"
import type { MultiPolygon, Point } from "../../types/Geometry"

export interface Municipality {
  id: string
  country: Country
  code: string
  city_name: string
  postal_code: string
  city_delivery_name: string
  city_delivery_detail?: string
  city_centroid?: Point
  city_shape?: MultiPolygon
}

export const MunicipalityTable = Table<Municipality>({
  table: "registered_postal_codes",
  primaryKey: "id",
  geometry: ["city_centroid", "city_shape"],
})
