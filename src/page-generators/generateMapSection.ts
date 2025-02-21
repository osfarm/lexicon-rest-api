import { match } from "shulk"
import type { OutputFormat } from "../types/OutputFormat"
import type { MultiPolygon, Polygon } from "../types/Geometry"
import type { Coordinates } from "../types/Coordinates"
import { Map } from "../templates/components/Map"

interface MapSectionParams {
  output: OutputFormat
  center: Coordinates
  markers: Coordinates[]
  shapes: (Polygon | MultiPolygon)[]
}

export function generateMapSection(params: MapSectionParams) {
  return match(params.output)
    .returnType<any>()
    .case({
      geojson: () => ({
        type: "FeatureCollection",
        features: params.shapes.map((geometry) => ({ type: "Feature", geometry })),
      }),
      _otherwise: () =>
        Map({
          center: params.center,
          markers: params.markers,
          shapes: params.shapes,
        }),
    })
}
