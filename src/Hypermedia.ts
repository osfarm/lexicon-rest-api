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
  Date: {
    label: string
    value: string
    iso: string
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
  } else if (typeof hypermedia === "object" && hypermedia !== null) {
    // Mutate instead of repeated spreads (was O(N^2) on big maps like the
    // 8700-key weather `values` object).
    const jsonified: Record<string, unknown> = {}
    let stateValue: unknown = undefined
    for (const [key, value] of Object.entries(hypermedia)) {
      const transformed =
        key === "@id" ||
        typeof value === "string" ||
        typeof value === "number" ||
        value === undefined
          ? value
          : hypermedia2jsonobj(value)
      if (key === "_state") {
        stateValue = transformed
      } else {
        jsonified[key] = transformed
      }
    }
    // Preserve the original behavior of placing `@type` first.
    if (stateValue !== undefined) {
      return { "@type": stateValue, ...jsonified }
    }
    return jsonified
  } else {
    return hypermedia
  }
}

export function hypermedia2json(request: Request, hypermedia: object): Response {
  if (hypermedia instanceof Error) {
    const status = match(hypermedia.name).with({
      BadRequest: 400,
      Unauthorized: 401,
      Forbidden: 403,
      NotFound: 404,
      Conflict: 409,
      Gone: 410,
      _otherwise: 500,
    })

    return new Response(
      JSON.stringify({
        "@id": request.url,
        status,
        name: hypermedia.name,
        message: hypermedia.message,
      }),
      { status: status },
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
      (hypermedia.result._state === "Failed" || hypermedia.result._state === "Err")
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
          if (isObject(col)) {
            return match(col).case({
              Text: (c) => `"${c.value}"`,
              Number: (c) => c.value.toString(),
              Boolean: (c) => (c.value === true ? "1" : "0"),
              Date: (c) => c.iso,
              Link: (c) => `=HYPERLINK("${c.href}";"${c.value}")`,
              List: (c) => `"${c.values.join(", ")}"`,
              _otherwise: () => "",
            })
          } else {
            return ""
          }
        })
        .join(","),
    ),
  ].join("\n")

  return new Response(csv, { headers: { "Content-Type": "text/csv" } })
}
