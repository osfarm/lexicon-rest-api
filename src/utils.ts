export type OutputFormat = "html" | "json" | "csv"

export function createHref(
  basePath: string,
  query: { page?: number; [key: string]: unknown }
) {
  const queryString = Object.entries(query)
    .map(([key, value]) => `${key}=${value}`)
    .join("&")

  return basePath + "?" + queryString
}

export function ObjectMap<T extends object, P>(
  obj: T,
  fn: (key: keyof T, value: T[keyof T]) => P
): Record<keyof T, P> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      fn(key as keyof T, value as any),
    ])
  ) as Record<keyof T, P>
}

export function ObjectFlatMap<T, I>(
  obj: Record<string, I>,
  fn: (key: string, value: I) => Record<string, T>
): Record<string, T> {
  let mappedObj = {}
  const entries = Object.entries(obj)

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]

    mappedObj = { ...mappedObj, ...fn(key, value) }
  }
  return mappedObj as Record<string, T>
}
