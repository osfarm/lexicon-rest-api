import type { Pool } from "pg"
import { relaxedQuery } from "../rd-agri/RdAgri"

// Plant health bulletins (bulletins de santé du végétal, BSV) of the DRAAF and their
// epidemiological networks (package bsv), and the archive of the project
// PestObserver, 1955–2016 (package bsv_archive). The risks are read from each
// bulletin by an AI model on the build side: they are never an observation.

const DB_SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${DB_SCHEMA}".registered_bsv_${name}`

type Db = Pick<Pool, "query">

// The search columns are built without accents, with the same mapping as the
// R&D documents (lib/datasources/bsv.rb and bsv_archive.rb in the lexicon repository)
const ACCENTED = "àâäáãéèêëîïíôöóõùûüúçñÿœæ"
const UNACCENTED = "aaaaaeeeeiiioooouuuucnyoa"

// A bulletin older than this before the date asked is not "this week" any more
export const RECENT_DAYS = 21
export const SEARCH_PAGE_SIZE = 20
const MAX_TEXT_LENGTH = 200

export const BSV_CAVEAT =
  "These risks were extracted automatically by an AI model from the cited bulletin: they are not an official observation. Read the bulletin (pdf-url) before acting. A level non_precise means the bulletin gives no evaluation for that line."

export const BSV_CREDIT =
  "Bulletins de santé du végétal — réseaux d'épidémiosurveillance (DRAAF, chambres d'agriculture, FREDON); reproduction allowed with mention of the source."

export const BSV_ARCHIVE_CREDIT =
  "Archive of the plant health bulletins and Avertissements agricoles, project PestObserver, CC-BY; text read by OCR, of medium quality before 2000."

export const LEVELS = [
  "tres_fort",
  "fort",
  "moyen",
  "faible",
  "nul",
  "non_precise",
] as const

const DEPARTMENT = /^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/
const INSEE_CODE = /^[0-9][0-9AB][0-9]{3}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const said = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : ""

  return trimmed === "" ? undefined : trimmed
}

/**
 * The department of a commune, from its INSEE code: three digits overseas.
 */
export function departmentOf(inseeCode: string): string | undefined {
  const code = inseeCode.trim().toUpperCase()

  if (!INSEE_CODE.test(code)) {
    return undefined
  }

  const department = code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2)

  return DEPARTMENT.test(department) ? department : undefined
}

export const isDepartment = (value: string) => DEPARTMENT.test(value)

const dateOf = (value: unknown) => {
  const text = said(value)

  return text !== undefined && DATE.test(text) && !Number.isNaN(Date.parse(text))
    ? text
    : undefined
}

export const today = (now = new Date()) => now.toISOString().slice(0, 10)

export type RiskQuery = Readonly<{
  department: string
  // A reference name of a production, such as winter_rape
  production?: string
  // Words naming the crop as bulletins write it, such as colza
  crop?: string
  // YYYY-MM-DD
  date: string
}>

/**
 * What a request or a tool call asks for, or undefined without a department.
 */
export function riskQueryOf(
  input: { department?: unknown; production?: unknown; crop?: unknown; date?: unknown },
  now = new Date(),
): RiskQuery | undefined {
  const department = said(input.department)?.toUpperCase()
  const crop = said(input.crop)

  if (department === undefined || !DEPARTMENT.test(department)) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries({
      department,
      production: said(input.production),
      // Something to match is needed: a crop of punctuation alone would match every line
      crop: crop !== undefined && /[\p{L}\p{N}]/u.test(crop) ? crop : undefined,
      date: dateOf(input.date) ?? today(now),
    }).filter(([, value]) => value !== undefined),
  ) as RiskQuery
}

// Lower case, without accents, every run of other characters as one space
const plain = (expression: string) =>
  `btrim(regexp_replace(translate(lower(${expression}), '${ACCENTED}', '${UNACCENTED}'), '[^a-z0-9]+', ' ', 'g'))`

// An edition is told by its region, sector, subsector and zone, whatever their
// case and accents ("Territoire Rhônalpin" and "rhônalpin" are one zone)
const editionKey = (alias: string) =>
  `concat_ws('|', ${alias}.region, ${["sector", "subsector", "zone"]
    .map(
      (column) =>
        `regexp_replace(${plain(`COALESCE(${alias}.${column}, '')`)}, '^(territoire|edition) ', '')`,
    )
    .join(", ")})`

/**
 * The condition a line of risk must meet for the crop asked: its production
 * reference names, or the words of its crop, either holding the other.
 */
function cropCondition(
  query: Pick<RiskQuery, "production" | "crop">,
  alias: string,
  bind: (value: unknown) => string,
): string | undefined {
  const conditions = [
    query.production &&
      `${alias}.production_names && ARRAY[${bind(query.production)}]::varchar[]`,
    query.crop &&
      ((crop: string) =>
        `(${plain(`${alias}.crop`)} LIKE '%' || ${plain(crop)} || '%' OR ' ' || ${plain(crop)} || ' ' LIKE '% ' || ${plain(`${alias}.crop`)} || ' %')`)(
        `${bind(query.crop)}::text`,
      ),
  ].filter(Boolean)

  return conditions.length === 0 ? undefined : `(${conditions.join(" OR ")})`
}

/**
 * The latest bulletin of each edition covering the department, published on or
 * before the date, among those that speak of the crop asked.
 */
export function editionsSql(query: RiskQuery): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const date = `${bind(query.date)}::date`
  const crop = cropCondition(query, "r", bind)

  return {
    text: `SELECT * FROM (
             SELECT DISTINCT ON (edition) *
               FROM (SELECT b.id, b.citation, b.label, b.region, b.sector, b.subsector, b.zone,
                            b.nature, b.number, b.pdf_url, b.article_url, b.published_on AS day,
                            to_char(b.published_on, 'YYYY-MM-DD') AS published_on,
                            b.published_on >= ${date} - ${RECENT_DAYS} AS recent,
                            ${editionKey("b")} AS edition
                       FROM ${table("bulletins")} AS b
                      WHERE b.department_codes @> ARRAY[${bind(query.department)}]::varchar[]
                        AND b.status = 'extracted'
                        AND b.published_on <= ${date}
                        ${crop ? `AND EXISTS (SELECT 1 FROM ${table("risks")} AS r WHERE r.bulletin_id = b.id AND ${crop})` : ""}
                    ) AS bulletins
              ORDER BY edition, day DESC, id
           ) AS editions
           ORDER BY day DESC, edition;`,
    values,
  }
}

/**
 * The lines of the bulletins chosen, for the crop asked: the most severe first.
 */
export function linesSql(
  bulletinIds: string[],
  query: Pick<RiskQuery, "production" | "crop">,
): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const ids = `${bind(bulletinIds)}::varchar[]`
  const crop = cropCondition(query, "r", bind)

  return {
    text: `SELECT r.* FROM ${table("risks")} AS r
            WHERE r.bulletin_id = ANY(${ids})${crop ? ` AND ${crop}` : ""}
            ORDER BY array_position(ARRAY[${LEVELS.map((level) => `'${level}'`).join(", ")}], r.level::text),
                     ${plain("r.crop")}, r.pest NULLS FIRST, r.page, r.id;`,
    values,
  }
}

export type BulletinReference = Readonly<{
  id: string
  citation?: string
  "published-on"?: string
  "pdf-url"?: string
  "article-url"?: string
  links: { self: string }
}>

export type BulletinSummary = BulletinReference &
  Readonly<{
    region: string
    sector?: string
    subsector?: string
    zone?: string
    nature?: string
    number?: string
    label?: string
  }>

export type RiskLine = Readonly<{
  crop: string
  "production-names"?: string[]
  pest?: string
  "pest-type"?: string
  stage?: string
  "bbch-min"?: number
  "bbch-max"?: number
  level: string
  "level-text"?: string
  conditional: boolean
  condition?: string
  "risk-period"?: string
  threshold?: string
  observations?: string
  page?: number
  "source-quote": string
}>

export type CropStage = Readonly<{
  crop: string
  stage?: string
  "bbch-min"?: number
  "bbch-max"?: number
  observations?: string
  page?: number
}>

export type Risks = Readonly<{
  department: string
  date: string
  // True when no bulletin of the last RECENT_DAYS days speaks of it: the latest one is given
  stale: boolean
  bulletins: BulletinSummary[]
  risks: (RiskLine & { bulletin: BulletinReference })[]
  stages: (CropStage & { bulletin: BulletinReference })[]
}>

const optional = <T>(value: T | null | undefined) => value ?? undefined

const bulletinPath = (id: string) => `/bsv/bulletins/${encodeURIComponent(id)}`

export const referenceOf = (row: Record<string, any>): BulletinReference => ({
  id: row.id,
  citation: optional(row.citation),
  "published-on": optional(row.published_on),
  "pdf-url": optional(row.pdf_url),
  "article-url": optional(row.article_url),
  links: { self: bulletinPath(row.id) },
})

export const summaryOf = (row: Record<string, any>): BulletinSummary => ({
  ...referenceOf(row),
  region: row.region,
  sector: optional(row.sector),
  subsector: optional(row.subsector),
  zone: optional(row.zone),
  nature: optional(row.nature),
  number: optional(row.number),
  label: optional(row.label),
})

// A line of stage: the bulletin says where the crop stands, not a risk
export const isStage = (row: Record<string, any>) =>
  row.pest_type === "stade" || row.pest === null || row.pest === undefined

export const riskOf = (row: Record<string, any>): RiskLine => ({
  crop: row.crop,
  "production-names":
    row.production_names && row.production_names.length > 0
      ? row.production_names
      : undefined,
  pest: optional(row.pest),
  "pest-type": optional(row.pest_type),
  stage: optional(row.stage),
  "bbch-min": optional(row.bbch_min),
  "bbch-max": optional(row.bbch_max),
  level: row.level,
  "level-text": optional(row.level_text),
  conditional: row.conditional === true,
  condition: optional(row.condition),
  "risk-period": optional(row.risk_period),
  threshold: optional(row.threshold),
  observations: optional(row.observations),
  page: optional(row.page),
  "source-quote": row.source_quote,
})

export const stageOf = (row: Record<string, any>): CropStage => ({
  crop: row.crop,
  stage: optional(row.stage),
  "bbch-min": optional(row.bbch_min),
  "bbch-max": optional(row.bbch_max),
  observations: optional(row.observations),
  page: optional(row.page),
})

/**
 * The bulletins to read among the latest of each edition: those of the last
 * RECENT_DAYS days, or the latest one alone when none is that recent.
 */
export function chosenEditions(rows: Record<string, any>[]) {
  const recent = rows.filter((row) => row.recent === true)

  return recent.length > 0
    ? { stale: false, rows: recent }
    : { stale: rows.length > 0, rows: rows.slice(0, 1) }
}

/**
 * The risks the latest bulletins covering a department give for a crop.
 *
 * @returns undefined when the bulletins are not in service
 */
export async function risksOf(db: Db, query: RiskQuery): Promise<Risks | undefined> {
  const editions = editionsSql(query)
  const found = await db
    .query(editions.text, editions.values)
    .then((result) => result.rows as Record<string, any>[])
    .catch(() => undefined)

  if (found === undefined) {
    return undefined
  }

  const { stale, rows } = chosenEditions(found)
  const references = new Map(rows.map((row) => [row.id as string, referenceOf(row)]))
  const linesQuery = linesSql([...references.keys()], query)
  const lines =
    rows.length === 0
      ? []
      : await db
          .query(linesQuery.text, linesQuery.values)
          .then((result) => result.rows as Record<string, any>[])
          .catch(() => undefined)

  if (lines === undefined) {
    return undefined
  }

  const bulletinOfLine = (row: Record<string, any>) =>
    references.get(row.bulletin_id) as BulletinReference

  return {
    department: query.department,
    date: query.date,
    stale,
    bulletins: rows.map(summaryOf),
    risks: lines
      .filter((row) => !isStage(row))
      .map((row) => ({ ...riskOf(row), bulletin: bulletinOfLine(row) })),
    stages: lines
      .filter(isStage)
      .sort(
        (a, b) =>
          String(a.crop).localeCompare(String(b.crop), "fr") ||
          (a.bbch_min ?? 0) - (b.bbch_min ?? 0),
      )
      .map((row) => ({ ...stageOf(row), bulletin: bulletinOfLine(row) })),
  }
}

export type Corpus = "current" | "archive"

export type SearchQuery = Readonly<{
  q: string
  department?: string
  // YYYY-MM-DD
  from?: string
  to?: string
  // Both corpora when absent
  corpus?: Corpus
}>

// A year alone stands for its first or its last day
const boundOf = (value: unknown, end: boolean) => {
  const text = said(value)

  if (text !== undefined && /^\d{4}$/.test(text)) {
    return end ? `${text}-12-31` : `${text}-01-01`
  }

  return dateOf(text)
}

/**
 * What a search asks for, or undefined without words.
 */
export function searchQueryOf(input: {
  q?: unknown
  department?: unknown
  from?: unknown
  to?: unknown
  corpus?: unknown
}): SearchQuery | undefined {
  const q = said(input.q)
  const department = said(input.department)?.toUpperCase()

  if (q === undefined) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries({
      q,
      department: department && DEPARTMENT.test(department) ? department : undefined,
      from: boundOf(
        typeof input.from === "number" ? String(input.from) : input.from,
        false,
      ),
      to: boundOf(typeof input.to === "number" ? String(input.to) : input.to, true),
      corpus:
        input.corpus === "current" || input.corpus === "archive"
          ? input.corpus
          : undefined,
    }).filter(([, value]) => value !== undefined),
  ) as SearchQuery
}

const tsquery = (bound: string) =>
  `websearch_to_tsquery('french', translate(lower(${bound}::text), '${ACCENTED}', '${UNACCENTED}'))`

const HEADLINE = `'MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" … ", StartSel="", StopSel=""'`

/**
 * The bulletins of today whose text matches, each with its best page.
 */
export function currentSearchSql(
  query: SearchQuery,
  limit: number,
): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const words = tsquery(bind(query.q))
  const conditions = [
    `p.search @@ words.q`,
    // A bulletin replaced by a corrected one is not given twice
    `b.status NOT IN ('superseded', 'refused')`,
    query.department &&
      `b.department_codes @> ARRAY[${bind(query.department)}]::varchar[]`,
    query.from && `b.published_on >= ${bind(query.from)}::date`,
    query.to && `b.published_on <= ${bind(query.to)}::date`,
  ].filter(Boolean)

  return {
    text: `WITH words AS (SELECT ${words} AS q),
           hits AS (
             SELECT DISTINCT ON (p.bulletin_id) p.bulletin_id, p.page, b.published_on,
                    ts_rank(p.search, words.q) AS rank
               FROM ${table("pages")} AS p
               JOIN ${table("bulletins")} AS b ON b.id = p.bulletin_id
              CROSS JOIN words
              WHERE ${conditions.join(" AND ")}
              ORDER BY p.bulletin_id, rank DESC, p.page
           ),
           best AS (
             SELECT *, count(*) OVER () AS total FROM hits
              ORDER BY rank DESC, published_on DESC NULLS LAST, bulletin_id
              LIMIT ${bind(limit)}
           )
           SELECT b.id, b.citation, b.label, b.page_title, b.region, b.regions, b.department_codes,
                  b.sector, b.nature, b.status, b.pdf_url, b.article_url,
                  to_char(b.published_on, 'YYYY-MM-DD') AS published_on,
                  extract(year FROM b.published_on)::integer AS year,
                  best.page, best.rank, best.total,
                  ts_headline('french', p.text, words.q, ${HEADLINE}) AS excerpt
             FROM best
             JOIN ${table("bulletins")} AS b ON b.id = best.bulletin_id
             JOIN ${table("pages")} AS p ON p.bulletin_id = best.bulletin_id AND p.page = best.page
            CROSS JOIN words
            ORDER BY best.rank DESC, b.published_on DESC NULLS LAST, b.id;`,
    values,
  }
}

/**
 * The documents of the archive whose title or text matches.
 */
export function archiveSearchSql(
  query: SearchQuery,
  limit: number,
): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const bind = (value: unknown) => `$${values.push(value)}`
  const words = tsquery(bind(query.q))
  // Many documents have a year and no date
  const conditions = [
    `d.search @@ words.q`,
    query.department &&
      `d.department_codes @> ARRAY[${bind(query.department)}]::varchar[]`,
    query.from &&
      `COALESCE(d.published_on, make_date(d.year, 12, 31)) >= ${bind(query.from)}::date`,
    query.to &&
      `COALESCE(d.published_on, make_date(d.year, 1, 1)) <= ${bind(query.to)}::date`,
  ].filter(Boolean)

  return {
    text: `WITH words AS (SELECT ${words} AS q),
           best AS (
             SELECT d.id, ts_rank(d.search, words.q) AS rank, count(*) OVER () AS total
               FROM ${table("archive_documents")} AS d
              CROSS JOIN words
              WHERE ${conditions.join(" AND ")}
              ORDER BY rank DESC, COALESCE(d.published_on, make_date(d.year, 1, 1)) DESC NULLS LAST, d.id
              LIMIT ${bind(limit)}
           )
           SELECT d.id, d.title, d.kind, d.regions, d.old_regions, d.department_codes, d.sectors,
                  to_char(d.published_on, 'YYYY-MM-DD') AS published_on, d.year,
                  best.rank, best.total,
                  ts_headline('french', d.text, words.q, ${HEADLINE}) AS excerpt
             FROM best
             JOIN ${table("archive_documents")} AS d ON d.id = best.id
            CROSS JOIN words
            ORDER BY best.rank DESC, COALESCE(d.published_on, make_date(d.year, 1, 1)) DESC NULLS LAST, d.id;`,
    values,
  }
}

export type SearchItem = Readonly<{
  corpus: Corpus
  id: string
  title: string
  date?: string
  year?: number
  regions: string[]
  "department-codes": string[]
  kind?: string
  // The page of the bulletin that matches best
  page?: number
  excerpt?: string
  "pdf-url"?: string
  "article-url"?: string
  rank: number
  links: { self: string }
}>

export type BulletinSearch = Readonly<{
  total: number
  // True when nothing had every word, and what has any of them is given instead
  relaxed: boolean
  // How many matched in each corpus searched; null when it is not in service
  corpora: Partial<Record<Corpus, number | null>>
  items: SearchItem[]
}>

const spaced = (text: unknown) =>
  typeof text === "string" ? text.replace(/\s+/g, " ").trim() || undefined : undefined

export const currentItemOf = (row: Record<string, any>): SearchItem => ({
  corpus: "current",
  id: row.id,
  title: row.citation ?? row.label ?? row.page_title ?? row.id,
  date: optional(row.published_on),
  year: optional(row.year),
  regions: row.regions ?? [row.region],
  "department-codes": row.department_codes ?? [],
  kind: optional(row.nature),
  page: optional(row.page),
  excerpt: spaced(row.excerpt),
  "pdf-url": optional(row.pdf_url),
  "article-url": optional(row.article_url),
  rank: Number(row.rank),
  links: { self: bulletinPath(row.id) },
})

const archivePath = (id: string) => `/bsv/archive/${encodeURIComponent(id)}`

export const archiveItemOf = (row: Record<string, any>): SearchItem => ({
  corpus: "archive",
  id: row.id,
  title: row.title ?? row.id,
  date: optional(row.published_on),
  year: optional(row.year),
  regions: row.regions && row.regions.length > 0 ? row.regions : (row.old_regions ?? []),
  "department-codes": row.department_codes ?? [],
  kind: optional(row.kind),
  excerpt: spaced(row.excerpt),
  rank: Number(row.rank),
  links: { self: archivePath(row.id) },
})

// The bulletins of today before the archive, whatever their rank: someone who
// searches wants what is announced now. Then the most relevant, the most recent
const CORPUS_ORDER: Corpus[] = ["current", "archive"]

const byCorpusRankThenDate = (a: SearchItem, b: SearchItem) =>
  CORPUS_ORDER.indexOf(a.corpus) - CORPUS_ORDER.indexOf(b.corpus) ||
  b.rank - a.rank ||
  String(b.date ?? b.year ?? "").localeCompare(String(a.date ?? a.year ?? "")) ||
  a.id.localeCompare(b.id)

/**
 * The results of both corpora in one list, the bulletins of today first.
 */
export function mergedSearch(
  answers: Partial<Record<Corpus, { total: number; items: SearchItem[] } | undefined>>,
  page: { limit: number; offset: number },
): Omit<BulletinSearch, "relaxed"> {
  const corpora = Object.fromEntries(
    Object.entries(answers).map(([corpus, answer]) => [corpus, answer?.total ?? null]),
  )
  const items = Object.values(answers)
    .flatMap((answer) => answer?.items ?? [])
    .sort(byCorpusRankThenDate)

  return {
    total: Object.values(answers).reduce((sum, answer) => sum + (answer?.total ?? 0), 0),
    corpora,
    items: items.slice(page.offset, page.offset + page.limit),
  }
}

function searchCorpus(db: Db, corpus: Corpus, query: SearchQuery, limit: number) {
  const { text, values } =
    corpus === "current" ? currentSearchSql(query, limit) : archiveSearchSql(query, limit)

  return db
    .query(text, values)
    .then((result) => ({
      total: result.rows.length === 0 ? 0 : Number(result.rows[0].total),
      items: (result.rows as Record<string, any>[]).map(
        corpus === "current" ? currentItemOf : archiveItemOf,
      ),
    }))
    .catch(() => undefined)
}

async function searchOnce(
  db: Db,
  query: SearchQuery,
  page: { limit: number; offset: number },
) {
  const corpora: Corpus[] =
    query.corpus === undefined ? ["current", "archive"] : [query.corpus]
  // Each corpus gives what the page could hold, the merge keeps the best
  const answers = await Promise.all(
    corpora.map((corpus) => searchCorpus(db, corpus, query, page.offset + page.limit)),
  )

  return {
    anyInService: answers.some((answer) => answer !== undefined),
    ...mergedSearch(
      Object.fromEntries(corpora.map((corpus, i) => [corpus, answers[i]])),
      page,
    ),
  }
}

/**
 * Searches the bulletins of today and the archive by their words, accents ignored.
 *
 * @returns undefined when no corpus searched is in service
 */
export async function searchBulletins(
  db: Db,
  query: SearchQuery,
  page: { limit: number; offset: number },
): Promise<BulletinSearch | undefined> {
  const { anyInService, ...strict } = await searchOnce(db, query, page)
  const relaxed = relaxedQuery(query.q)

  if (!anyInService) {
    return undefined
  }
  if (strict.total > 0 || relaxed === undefined) {
    return { ...strict, relaxed: false }
  }

  const { anyInService: _, ...wider } = await searchOnce(
    db,
    { ...query, q: relaxed },
    page,
  )

  return { ...wider, relaxed: true }
}

export type BulletinRecord = BulletinSummary &
  Readonly<{
    regions: string[]
    "department-codes": string[]
    "page-title"?: string
    section?: string
    "first-seen-on"?: string
    "last-seen-on"?: string
    "pages-count": number
    scanned?: boolean
    status: string
    "superseded-by"?: string
    // The model that read the risks, and the version of what it was told
    model?: string
    "instructions-version"?: string
    risks: RiskLine[]
    stages: CropStage[]
    pages: { page: number; text: string }[]
  }>

export function bulletinRecordOf(
  row: Record<string, any>,
  lines: Record<string, any>[],
  pages: Record<string, any>[],
): BulletinRecord {
  return {
    ...summaryOf(row),
    regions: row.regions ?? [],
    "department-codes": row.department_codes ?? [],
    "page-title": optional(row.page_title),
    section: optional(row.section),
    "first-seen-on": optional(row.first_seen_on),
    "last-seen-on": optional(row.last_seen_on),
    "pages-count": row.pages_count,
    scanned: optional(row.scanned),
    status: row.status,
    "superseded-by": optional(row.superseded_by),
    model: optional(row.model),
    "instructions-version": optional(row.instructions_version),
    risks: lines.filter((line) => !isStage(line)).map(riskOf),
    stages: lines.filter(isStage).map(stageOf),
    pages: pages.map((page) => ({ page: page.page, text: page.text })),
  }
}

const DATES = ["published_on", "first_seen_on", "last_seen_on"]

/**
 * @returns the bulletin with its risks and the text of its pages, null when
 * there is none, undefined when the bulletins are not in service
 */
export async function bulletinOf(
  db: Db,
  id: string,
): Promise<BulletinRecord | null | undefined> {
  const rowsOf = (sql: string) =>
    db.query(sql, [id]).then((result) => result.rows as Record<string, any>[])
  const dated = DATES.map(
    (column) => `to_char(${column}, 'YYYY-MM-DD') AS ${column}`,
  ).join(", ")

  return Promise.all([
    rowsOf(`SELECT *, ${dated} FROM ${table("bulletins")} WHERE id = $1;`),
    rowsOf(
      `SELECT * FROM ${table("risks")} WHERE bulletin_id = $1
        ORDER BY page NULLS LAST, array_position(ARRAY[${LEVELS.map((level) => `'${level}'`).join(", ")}], level::text), crop, pest NULLS FIRST, id;`,
    ),
    rowsOf(
      `SELECT page, text FROM ${table("pages")} WHERE bulletin_id = $1 ORDER BY page;`,
    ),
  ])
    .then(([bulletins, lines, pages]) =>
      bulletins.length === 0 ? null : bulletinRecordOf(bulletins[0], lines, pages),
    )
    .catch(() => undefined)
}

export type ArchiveDocument = Readonly<{
  id: string
  "file-name": string
  kind: string
  title?: string
  date?: string
  year?: number
  "old-regions": string[]
  regions: string[]
  "department-codes": string[]
  sectors: string[]
  text: string
  links: { self: string }
}>

export const archiveDocumentRecordOf = (row: Record<string, any>): ArchiveDocument => ({
  id: row.id,
  "file-name": row.file_name,
  kind: row.kind,
  title: optional(row.title),
  date: optional(row.published_on),
  year: optional(row.year),
  "old-regions": row.old_regions ?? [],
  regions: row.regions ?? [],
  "department-codes": row.department_codes ?? [],
  sectors: row.sectors ?? [],
  text: row.text,
  links: { self: archivePath(row.id) },
})

/**
 * @returns the document of the archive, null when there is none, undefined
 * when the archive is not in service
 */
export function archiveDocumentOf(
  db: Db,
  id: string,
): Promise<ArchiveDocument | null | undefined> {
  return db
    .query(
      `SELECT id, file_name, kind, old_regions, regions, department_codes, sectors,
              to_char(published_on, 'YYYY-MM-DD') AS published_on, year, title, text
         FROM ${table("archive_documents")} WHERE id = $1;`,
      [id],
    )
    .then((result) =>
      result.rows.length === 0 ? null : archiveDocumentRecordOf(result.rows[0]),
    )
    .catch(() => undefined)
}

const AGENT_TEXT_LENGTHS = [200, 100, 60]

// What a model is given of a tool result is cut beyond 12 000 characters
// (`DEFAULT_LIMITS` of the assistant): the risks are made to fit before that
export const AGENT_BUDGET = 11000

const cutTo = (length: number) => (text: string | undefined) =>
  text !== undefined && text.length > length ? text.slice(0, length) + "…" : text

/**
 * The risks in the shape given to a model: each bulletin once, the lines
 * pointing to it by its id, long texts cut. Longer than `budget` characters,
 * the texts are cut shorter, then the lowest risks (they come last) are left
 * out, saying how many: a model that reads a cut list takes it for the whole.
 */
export function risksForAgents(risks: Risks, budget = AGENT_BUDGET) {
  const line = <T extends { bulletin: BulletinReference }>(
    row: T,
  ): Omit<T, "bulletin"> & { bulletin: string } => ({
    ...row,
    bulletin: row.bulletin.id,
  })
  const shaped = (length: number, kept: number) => {
    const cut = cutTo(length)
    const omitted = risks.risks.length - kept

    return {
      department: risks.department,
      date: risks.date,
      stale: risks.stale,
      bulletins: risks.bulletins.map((bulletin) => ({
        id: bulletin.id,
        citation: bulletin.citation ?? bulletin.label,
        "published-on": bulletin["published-on"],
        "pdf-url": bulletin["pdf-url"],
        "article-url": bulletin["article-url"],
      })),
      risks: risks.risks.slice(0, kept).map((risk) => ({
        ...line(risk),
        "production-names": undefined,
        "level-text": cut(risk["level-text"]),
        observations: cut(risk.observations),
        "source-quote": cut(risk["source-quote"]),
        condition: cut(risk.condition),
        threshold: cut(risk.threshold),
        "risk-period": cut(risk["risk-period"]),
      })),
      ...(omitted > 0
        ? {
            "omitted-risks": omitted,
            "omitted-note": `${omitted} lower risks were left out for length: ask again with a crop to read them.`,
          }
        : {}),
      stages: risks.stages.map((stage) => ({
        ...line(stage),
        observations: cut(stage.observations),
      })),
    }
  }
  const fits = (value: unknown) => JSON.stringify(value).length <= budget

  for (const length of AGENT_TEXT_LENGTHS) {
    const whole = shaped(length, risks.risks.length)
    if (fits(whole)) {
      return whole
    }
  }
  const shortest = AGENT_TEXT_LENGTHS[AGENT_TEXT_LENGTHS.length - 1]
  let kept = risks.risks.length - 1
  while (kept > 0 && !fits(shaped(shortest, kept))) {
    kept -= 1
  }
  return shaped(shortest, kept)
}
