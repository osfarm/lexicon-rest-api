import type { Point } from "./Geometry"

export interface Coordinates {
  latitude: number
  longitude: number
}

export function pointToCoordinates(point: Point): Coordinates {
  return {
    latitude: point.coordinates[1],
    longitude: point.coordinates[0],
  }
}
