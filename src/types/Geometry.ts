export interface Point {
  type: "Point"
  coordinates: GeoJSONCoordinates
}

export interface MultiPolygon {
  type: "MultiPolygon"
  coordinates: GeoJSONCoordinates[][][]
}

type GeoJSONCoordinates = [Longitude, Latitude]

type Latitude = number
type Longitude = number

export type Geometry = Point | MultiPolygon
