import { Err, Ok, type Result } from "shulk"
import type { Municipality } from "./Municipality"
import type { MultiPolygon, Point } from "../../types/Geometry"

interface MunicipalityWithGeolocation {
  id: string
  city_name: string
  city_centroid: Point
  city_shape: MultiPolygon
}

export namespace MunicipalityFilters {
  export function hasGeolocation(
    municipality: Municipality
  ): Result<Error, MunicipalityWithGeolocation> {
    if (municipality.city_shape && municipality.city_centroid) {
      return Ok({
        id: municipality.id,
        city_name: municipality.city_name,
        city_centroid: municipality.city_centroid,
        city_shape: municipality.city_shape,
      })
    } else {
      return Err(new Error("This municipality has no geolocation data."))
    }
  }
}
