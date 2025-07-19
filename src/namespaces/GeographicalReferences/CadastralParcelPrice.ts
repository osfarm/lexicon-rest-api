import { Table } from "../../Database"
import type { Point } from "../../types/Geometry"

export interface ParcelPrice {
  id: string
  building_nature?: string
  building_area?: number
  cadastral_parcel_id: string
  cadastral_parcel_area?: number
  cadastral_price: number
  mutation_id: string
  mutation_date: Date
  centroid: Point
  address: string
  postal_code: string
  city: string
  department: string
}

export const ParcelPriceTable = Table<ParcelPrice>({
  table: "registered_cadastral_prices",
  primaryKey: "id",
  geometry: ["centroid"],
})
