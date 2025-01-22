import { isObject, match, union, type InferUnion } from "shulk"

export const Hypermedia = union<{
  Undefined: { label: string; value: string; icon?: string }
  Text: {
    label: string
    value: string
    color?: string
  }
  Number: {
    label: string
    value: number
    unit?: string
    icon?: string
  }
  Boolean: {
    label: string
    value: boolean
  }
  Datum: {
    label: string
    value: number
    unit: string
    timestamp: number
    interpretation?: string
    icon?: string
    color?: string
  }
  Gauge: {
    label?: string
    value: number
    minimum: number
    maximum: number
    unit: string
    minimumColor: string
    maximumColor: string
  }
  Image: {
    label?: string
    href: string
    alt: string
    width: number
    height: number
  }
  Link: {
    label?: string
    value: string
    icon?: string
    color?: string
    method: "GET" | "POST"
    href: string
    payload?: Record<string, unknown>
  }
  List: {
    label: string
    values: unknown[]
  }
  Map: {
    label: string
    icon?: string
    values: Record<string, unknown>
  }
}>()
export type Hypermedia = InferUnion<typeof Hypermedia>["any"]
export type HypermediaType = InferUnion<typeof Hypermedia>

export const HypermediaList = <T>(list: { label: string; values: T[] }) => {
  return { _state: "List" as "List", ...list }
}

export const HypermediaMap = <T extends Record<string, Hypermedia>>(map: {
  label: string
  icon?: string
  values: T
}) => {
  return { _state: "Map" as "Map", ...map }
}

export type HypermediaResponse = {
  id: string
  title: string
} & { [x: string]: Hypermedia }

export function hyperlink2href(hyperlink: HypermediaType["Link"]): string {
  if (hyperlink.payload) {
    return (
      hyperlink.href +
      "?" +
      Object.entries(hyperlink.payload)
        .filter(([, val]) => val !== undefined)
        .map(([key, val]) => `${key}=${val}`)
        .join("&")
    )
  } else {
    return hyperlink.href
  }
}

function hypermedia2jsonobj(hypermedia: object): object {
  if (Array.isArray(hypermedia)) {
    return hypermedia.map((val) => hypermedia2jsonobj(val))
  } else if (
    typeof hypermedia === "string" ||
    typeof hypermedia === "number" ||
    typeof hypermedia === "boolean"
  ) {
    return hypermedia
  }

  const jsonified: object = Object.entries(hypermedia)
    .map(([key, value]) => {
      if (
        key === "@id" ||
        typeof value === "string" ||
        typeof value === "number" ||
        value === undefined
      ) {
        return [key, value]
      } else {
        return [key, hypermedia2jsonobj(value)]
      }
    })
    .reduce((previous, [key, value]) => {
      if (key === "_state") {
        return { "@type": value, ...previous }
      } else {
        return { ...previous, [key]: value }
      }
    }, {})

  return jsonified
}

export function hypermedia2json(
  request: Request,
  hypermedia: object
): Response {
  if (hypermedia instanceof Error) {
    const status = match(hypermedia.name).with({
      BadRequestError: 400,
      UnauthorizedError: 401,
      ForbiddenError: 403,
      NotFoundError: 404,
      Conflict: 409,
      _otherwise: 500,
    })

    return new Response(
      JSON.stringify({
        "@id": request.url,
        status,
        name: hypermedia.name,
        message: hypermedia.message,
      }),
      { status: status }
    )
  } else {
    let status = 200

    if (
      "result" in hypermedia &&
      isObject(hypermedia.result) &&
      "_state" in hypermedia.result &&
      "val" in hypermedia.result &&
      isObject(hypermedia.result.val) &&
      "message" in hypermedia.result.val &&
      (hypermedia.result._state === "Failed" ||
        hypermedia.result._state === "Err")
    ) {
      status = 400

      hypermedia.result = {
        "@type": "Failed",
        name: "BadRequestError",
        message: hypermedia.result.val.message,
      }
    }

    const jsonified = hypermedia2jsonobj(hypermedia)

    return new Response(JSON.stringify({ "@id": request.url, ...jsonified }), {
      status,
    })
  }
}

type TableCompatible =
  | {
      table: {
        columns: Record<string, string>
        rows: Record<string, HypermediaType["any"] | undefined>[]
      }
    }
  | { error: Error }

export function hypermedia2csv(obj: TableCompatible) {
  if ("error" in obj) {
    console.error(obj)
    return new Response(obj.error.message)
  }

  const csv = [
    Object.values(obj.table.columns).join(","),
    ...obj.table.rows.map((item) =>
      Object.values(item)
        .map((col) => {
          if (isObject(col) && "value" in col) {
            return `"${col.value}"`
          } else {
            return ""
          }
        })
        .join(",")
    ),
  ].join("\n")

  return new Response(csv, { headers: { "Content-Type": "text/csv" } })
}
