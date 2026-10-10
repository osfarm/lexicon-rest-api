// What a visitor without a key is shown of data reserved to members: the first
// characters of each text, nothing of a figure. Only that leaves the server.

export const PREVIEW_LENGTH = 2
// Rows of a reserved table a visitor without a key is shown
export const PREVIEW_ROWS = 10

export type Veiled = Readonly<{
  // What is readable
  start: string
  // What is drawn blurred in place of the rest: the same for every value
  veil: string
}>

const TEXT_VEIL = "xxxxxxxxxx"
const FIGURE_VEIL = "00000"

// A price, a quantity, a date or a code made of digits: its first characters say most of it
const FIGURE = /^[\s\d.,:;/%€+-]*$/

/**
 * The part of a value a visitor without a key can read.
 */
export function veiled(value: unknown): Veiled | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value !== "string" || FIGURE.test(value)) {
    return { start: "", veil: FIGURE_VEIL }
  }

  return { start: value.slice(0, PREVIEW_LENGTH), veil: TEXT_VEIL }
}

/**
 * The same for a cell of a table: a text or the label of a link is started,
 * any other kind of cell is veiled whole. The address of a link is dropped.
 */
export function veiledCell(cell: unknown): Veiled | undefined {
  if (cell === undefined || cell === null || typeof cell !== "object") {
    return veiled(cell)
  }

  const { _state: kind, value } = cell as { _state?: string; value?: unknown }

  return kind === "Text" || kind === "Link"
    ? veiled(value)
    : kind === "Undefined"
      ? undefined
      : { start: "", veil: FIGURE_VEIL }
}
