import type { Pool } from "pg"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type Db = Pick<Pool, "query">

// The search column of the documents is built without accents, with this same
// mapping (lib/datasources/rd_agri.rb in the lexicon repository)
const ACCENTED = "àâäáãéèêëîïíôöóõùûüúçñÿœæ"
const UNACCENTED = "aaaaaeeeeiiioooouuuucnyoa"

export const PAGE_SIZE = 50
const EXCERPT_LENGTH = 300
const MAX_TEXT_LENGTH = 200

export type DocumentFilters = Readonly<{
  q?: string
  production?: string
  taxon?: string
  pest?: string
  "production-system"?: string
  "area-kind"?: string
  "area-code"?: string
  "year-from"?: number
  "year-to"?: number
  publisher?: string
}>

export type DocumentSummary = Readonly<{
  id: string
  title: string
  year: number | null
  publisher: string | null
  excerpt: string | null
  url: string
  links: { self: string }
}>

export type DocumentRecord = DocumentSummary &
  Readonly<{
    description: string | null
    language: string | null
    keywords: string[]
    project: { code: string; name: string | null } | null
    "notice-url": string | null
    "document-url": string | null
    productions: string[]
    taxa: string[]
    "production-systems": string[]
    areas: { kind: string; code: string }[]
    pests: { source: string; reference: string; label: string }[]
  }>

export type SearchResult = Readonly<{
  total: number
  // True when no document had all the words, and those having any of them are given instead
  relaxed: boolean
  documents: DocumentSummary[]
}>

const text = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : ""

  return trimmed === "" ? undefined : trimmed
}

const year = (value: unknown) => {
  const number = Number(value)

  return Number.isInteger(number) && number >= 1900 && number <= 2100 ? number : undefined
}

/**
 * The filters a request or a tool call asks for, without what is empty or malformed.
 */
export function filtersOf(input: Record<string, unknown>): DocumentFilters {
  const filters = {
    q: text(input.q),
    production: text(input.production),
    taxon: text(input.taxon),
    pest: text(input.pest),
    "production-system": text(input["production-system"]),
    "area-kind": text(input["area-kind"]),
    "area-code": text(input["area-code"]),
    "year-from": year(input["year-from"]),
    "year-to": year(input["year-to"]),
    publisher: text(input.publisher),
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  )
}

/**
 * The words of a search, any of which is enough: what is tried when no
 * document has them all.
 */
export function relaxedQuery(q: string): string | undefined {
  const words = q
    .replace(/["()]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && word.toLowerCase() !== "or")

  return words.length > 1 ? words.join(" or ") : undefined
}

/**
 * The query finding the documents that match the filters. Every value is bound.
 */
export function searchSql(
  filters: DocumentFilters,
  page: { limit: number; offset: number },
): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const table = (name: string) => `"${DB_SCHEMA}".registered_rd_agri_${name}`
  const linked = (name: string, condition: string) =>
    `EXISTS (SELECT 1 FROM ${table(name)} AS link WHERE link.document_id = d.id AND ${condition})`

  const tsquery =
    filters.q === undefined
      ? undefined
      : `websearch_to_tsquery('french', translate(lower(${bind(filters.q)}), '${ACCENTED}', '${UNACCENTED}'))`

  const conditions = [
    tsquery && `d.search @@ ${tsquery}`,
    filters.production &&
      linked("document_productions", `link.production = ${bind(filters.production)}`),
    filters.taxon && linked("document_taxa", `link.taxon = ${bind(filters.taxon)}`),
    filters["production-system"] &&
      linked(
        "document_production_systems",
        `link.production_system = ${bind(filters["production-system"])}`,
      ),
    filters.pest &&
      linked(
        "document_pests",
        `(link.pest_reference = ${bind(filters.pest)} OR link.label ILIKE '%' || ${bind(filters.pest)} || '%')`,
      ),
    filters["area-code"] &&
      linked(
        "document_areas",
        `link.area_code = ${bind(filters["area-code"])}` +
          (filters["area-kind"]
            ? ` AND link.area_kind = ${bind(filters["area-kind"])}`
            : ""),
      ),
    filters["year-from"] && `d.publication_year >= ${bind(filters["year-from"])}`,
    filters["year-to"] && `d.publication_year <= ${bind(filters["year-to"])}`,
    filters.publisher && `d.publisher ILIKE '%' || ${bind(filters.publisher)} || '%'`,
  ].filter(Boolean)

  return {
    text: `SELECT d.id, d.title, d.publication_year, d.publisher, d.description, d.page_url,
                  count(*) OVER () AS total
             FROM ${table("documents")} AS d
            ${conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""}
            ORDER BY ${tsquery ? `ts_rank(d.search, ${tsquery}) DESC, ` : ""}d.publication_year DESC NULLS LAST, d.id
            LIMIT ${bind(page.limit)} OFFSET ${bind(page.offset)};`,
    values,
  }
}

export function summaryOf(row: Record<string, any>): DocumentSummary {
  const description: string | null = row.description

  return {
    id: row.id,
    title: row.title,
    year: row.publication_year,
    publisher: row.publisher,
    excerpt:
      description === null
        ? null
        : description.length > EXCERPT_LENGTH
          ? description.slice(0, EXCERPT_LENGTH) + "…"
          : description,
    url: row.page_url,
    links: { self: `/rd-agri/documents/${encodeURIComponent(row.id)}` },
  }
}

export function recordOf(
  row: Record<string, any>,
  links: {
    productions: Record<string, any>[]
    taxa: Record<string, any>[]
    systems: Record<string, any>[]
    areas: Record<string, any>[]
    pests: Record<string, any>[]
  },
): DocumentRecord {
  return {
    ...summaryOf(row),
    description: row.description,
    language: row.language,
    keywords: row.keywords,
    project:
      row.project_code === null
        ? null
        : { code: row.project_code, name: row.project_name },
    "notice-url": row.notice_url,
    "document-url": row.document_url,
    productions: links.productions.map((link) => link.production),
    taxa: links.taxa.map((link) => link.taxon),
    "production-systems": links.systems.map((link) => link.production_system),
    areas: links.areas.map((link) => ({ kind: link.area_kind, code: link.area_code })),
    pests: links.pests.map((link) => ({
      source: link.pest_source,
      reference: link.pest_reference,
      label: link.label,
    })),
  }
}

async function runSearch(
  db: Db,
  filters: DocumentFilters,
  page: { limit: number; offset: number },
) {
  const { text: sql, values } = searchSql(filters, page)
  const result = await db.query(sql, values)

  return {
    total: result.rows.length === 0 ? 0 : Number(result.rows[0].total),
    documents: result.rows.map(summaryOf),
  }
}

/**
 * @returns the documents, or undefined when the dataset is not in service
 */
export async function searchDocuments(
  db: Db,
  filters: DocumentFilters,
  page: { limit: number; offset: number },
): Promise<SearchResult | undefined> {
  try {
    const strict = await runSearch(db, filters, page)
    const relaxed = filters.q === undefined ? undefined : relaxedQuery(filters.q)

    if (strict.total > 0 || relaxed === undefined) {
      return { ...strict, relaxed: false }
    }

    return { ...(await runSearch(db, { ...filters, q: relaxed }, page)), relaxed: true }
  } catch {
    return undefined
  }
}

/**
 * @returns the document, null when there is none, undefined when the dataset is not in service
 */
export async function readDocument(
  db: Db,
  id: string,
): Promise<DocumentRecord | null | undefined> {
  const rowsOf = (name: string, order: string) =>
    db
      .query(
        `SELECT * FROM "${DB_SCHEMA}".registered_rd_agri_${name} WHERE ${name === "documents" ? "id" : "document_id"} = $1 ORDER BY ${order};`,
        [id],
      )
      .then((result) => result.rows as Record<string, any>[])

  try {
    const [documents, productions, taxa, systems, areas, pests] = await Promise.all([
      rowsOf("documents", "id"),
      rowsOf("document_productions", "production"),
      rowsOf("document_taxa", "taxon"),
      rowsOf("document_production_systems", "production_system"),
      rowsOf("document_areas", "area_kind, area_code"),
      rowsOf("document_pests", "label"),
    ])

    return documents.length === 0
      ? null
      : recordOf(documents[0], { productions, taxa, systems, areas, pests })
  } catch {
    return undefined
  }
}
