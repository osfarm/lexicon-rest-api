// The pages of the API repeat a label and a type in every cell, for a browser
// to show them. A model reads values: the same page, said once.

type Json = unknown

const isObject = (value: Json): value is Record<string, Json> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

// What a page carries for someone clicking, not for someone reading
const CHROME = ["@id", "breadcrumbs", "navigation", "formats", "pages", "form", "credit"]

/**
 * The value of a cell: "30 cm" for a number with a unit, a day for a date, the
 * text of a link, the items of a list.
 */
function valueOf(cell: Record<string, Json>): Json {
  const kind = cell["@type"]

  if (kind === "List") {
    return Array.isArray(cell.values) ? cell.values.map(compact) : []
  }
  if (kind === "Map") {
    return compact(cell.values)
  }
  if (kind === "Date" && typeof cell.iso === "string") {
    return cell.iso.slice(0, 10)
  }
  if (kind === "Undefined") {
    return null
  }
  if (typeof cell.unit === "string" && cell.unit !== "" && cell.value !== undefined) {
    return `${cell.value} ${cell.unit}`
  }

  // A link is where to read more: its address is kept with its text
  if (kind === "Link" && typeof cell.href === "string" && cell.value !== undefined) {
    return { value: cell.value, href: cell.href }
  }

  return cell.value ?? cell.href ?? null
}

/**
 * Any part of a page, without what only serves its display.
 */
export function compact(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(compact)
  }
  if (!isObject(value)) {
    return value
  }
  if (typeof value["@type"] === "string") {
    return valueOf(value)
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => !CHROME.includes(key) && item !== undefined)
      .map(([key, item]) => [key, compact(item)]),
  )
}

const isTable = (value: Json): value is { columns: Record<string, string>; rows: Json[] } =>
  isObject(value) && isObject(value.columns) && Array.isArray(value.rows)

// In a row a link is its text alone: the address of every cell would double the table.
// A link that leaves the API is its address: that is what the cell is there to give
function cellOf(cell: Json): Json {
  const value = compact(cell) ?? null

  if (!isObject(cell) || cell["@type"] !== "Link" || !isObject(value)) {
    return value
  }

  return typeof value.href === "string" && /^https?:\/\//.test(value.href) ? value.href : value.value
}

/**
 * A table as its column names once, then one array per row.
 */
function tableOf(table: { columns: Record<string, string>; rows: Json[] }) {
  const keys = Object.keys(table.columns)

  return {
    columns: Object.values(table.columns),
    rows: table.rows.map((row) =>
      keys.map((key) => (isObject(row) ? cellOf(row[key]) : null)),
    ),
  }
}

/**
 * A page of the API as a model reads it: what it is, how many rows there are
 * and how to filter them first, then the rows.
 */
export function compactPage(page: Json): Json {
  if (!isObject(page)) {
    return page
  }

  const { table, form, title, page: number, ...rest } = page
  const filters = isObject(form) ? Object.keys(form) : []
  const sections = Object.fromEntries(
    Object.entries(rest)
      .filter(([key]) => !CHROME.includes(key) && !key.startsWith("items-") && key !== "total-pages")
      .map(([key, item]) => [key, isTable(item) ? tableOf(item) : compact(item)]),
  )

  return isTable(table)
    ? {
        title,
        "rows-total": rest["items-total"],
        page: number,
        "pages-total": rest["total-pages"],
        ...(filters.length > 0 ? { filters } : {}),
        ...tableOf(table),
        ...sections,
      }
    : {
        ...(title === undefined ? {} : { title }),
        ...(number === undefined ? {} : { page: number }),
        ...sections,
      }
}
