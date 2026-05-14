import { Table } from "../Database"

export interface EuMarketPrice {
  id: string
  nature?: string
  category?: string
  specie?: string
  production_reference_name?: string
  sector_code?: string
  product_code?: string
  product_label?: string
  product_description?: string
  unit_value?: number
  unit_name?: string
  country?: string
  price?: number
  start_date?: Date
  end_date?: Date
}

export const EuMarketPriceTable = Table<EuMarketPrice>({
  table: "registered_eu_market_prices",
  primaryKey: "id",
})
