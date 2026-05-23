import { Table } from "../../Database"
import type { Point, Polygon } from "../../types/Geometry"

export interface CapParcel {
  id: string
  cap_crop_code: string
  city_name: string
  shape: Polygon
  centroid: Point
  // Optional fields populated by callers that explicitly resolve the CAP
  // crop dictionary via MasterCapCodeTable (the dictionary's real PK is
  // composite (cap_code, production, year), so a generic LEFT JOIN here
  // was ambiguous and has been removed).
  cap_code?: string
  cap_label?: string
  production?: string
  cap_precision?: string
  cap_category?: string
  is_seed?: boolean
  year?: number
}

// The oneToOne join is kept for backward compatibility with consumers that
// rely on `cap_label` being flattened in (CapParcelAPI table/resource pages,
// MunicipalityAPI map popup). The Parcel Identifier flow ignores those flat
// fields and queries MasterCapCodeTable explicitly with a year filter.
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
