import { Table } from "../../Database"
import type { Point } from "../../types/Geometry"

export interface ParcelPrice {
  id: string
  building_nature: string
  building_area?: number
  cadastral_parcel_id: string
  cadastral_parcel_area?: number
  cadastral_price: number
  mutation_id: string
  mutation_date: Date
  centroid: Point
  postal_code: string
  department: string
}

export const ParcelPriceTable = Table<ParcelPrice>({
  table: "registered_cadastral_prices",
  primaryKey: "id",
  oneToOne: {
    cadastral_parcel_id: {
      table: "registered_cadastral_parcels",
      primaryKey: "id",
    },
  },
  geometry: ["centroid"],
})
