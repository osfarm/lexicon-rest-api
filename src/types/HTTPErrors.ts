import { match } from "shulk"

export class BadRequest extends Error {
  code = 400
}

export class NotFound extends Error {
  code = 404
}

export function errorToStatus(error: Error): number {
  return match(error.name).with({
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
    Conflict: 409,
    Gone: 410,
    _otherwise: 500,
  })
}
