import type { Coordinates } from "./Coordinates"

export interface Point {
  type: "Point"
  coordinates: GeoJSONCoordinates
  properties?: Record<string, unknown>
}

export interface Polygon {
  type: "Polygon"
  coordinates: GeoJSONCoordinates[][]
  properties?: Record<string, unknown>
}

export interface MultiPolygon {
  type: "MultiPolygon"
  coordinates: GeoJSONCoordinates[][][]
  properties?: Record<string, unknown>
}

type GeoJSONCoordinates = [Longitude, Latitude]

type Latitude = number
type Longitude = number

export type Geometry = Point | Polygon | MultiPolygon

export function coordinatesToPoint(coord: Coordinates): Point {
  return { type: "Point", coordinates: [coord.longitude, coord.latitude] }
}
