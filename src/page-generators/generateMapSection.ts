import { match } from "shulk"
import type { OutputFormat } from "../types/OutputFormat"
import type { Feature, MultiPolygon, Polygon } from "../types/Geometry"
import type { Coordinates } from "../types/Coordinates"
import { Map } from "../templates/components/Map"

type MapShape = Polygon | MultiPolygon | Feature

interface MapSectionParams {
  output: OutputFormat
  center: Coordinates
  markers: Coordinates[]
  shapes: MapShape[]
}

export function generateMapSection(params: MapSectionParams) {
  return match(params.output)
    .returnType<any>()
    .case({
      geojson: () => ({
        type: "FeatureCollection",
        features: params.shapes.map((s) =>
          s.type === "Feature" ? s : { type: "Feature", geometry: s },
        ),
      }),
      _otherwise: () =>
        Map({
          center: params.center,
          markers: params.markers,
          shapes: params.shapes,
        }),
    })
}
