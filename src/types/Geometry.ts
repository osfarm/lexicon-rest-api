export interface Point {
  type: "Point"
  coordinates: GeoJSONCoordinates
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

export type Geometry = Point | MultiPolygon
