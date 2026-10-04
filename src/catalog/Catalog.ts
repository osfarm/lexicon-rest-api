import type { Pool } from "pg"

const META_SCHEMA = import.meta.env.DB_META_SCHEMA ?? "lexicon_meta"

const PACKAGES_URL = (
  import.meta.env.PACKAGES_URL ?? "https://lexicon-packages.osfarm.org"
).replace(/\/$/, "")

const OPEN_SCOPE = "open"

type Db = Pick<Pool, "query">

type Manifest = {
  description?: string | null
  scope?: string
  credits?: {
    name?: string
    provider?: string
    url?: string
    licence?: string
    licence_url?: string
    updated_at?: string
  }[]
  depends_on?: { name: string; kind: string; built_against: string | null }[]
  tables?: { name: string; rows: number; role?: string }[]
  pivots?: Pivot[]
}

type Pivot = {
  key: string
  table: string
  column: string
  values: number
  matched: number
  rate: number | null
}

export type Dataset = Readonly<{
  name: string
  description: string | null
  version: string
  "loaded-at": string
  stale: boolean
  scope: string
  provider: string | null
  licence: string | null
  "licence-url": string | null
  "source-date": string | null
  "source-url": string | null
  tables: readonly { name: string; rows: number }[]
  rows: number
  "depends-on": readonly {
    name: string
    kind: string
    "built-against": string | null
    "in-service": string | null
  }[]
  pivots: readonly Pivot[]
  versions: readonly { version: string; current: boolean; download: string | null }[]
  href: string
}>

/**
 * What a package in service says about itself, in the shape the API publishes.
 * Tables carrying translations are an implementation detail and left out.
 */
export function datasetOf(
  row: {
    name: string
    version: string
    loaded_at: Date
    stale: boolean
    manifest: Manifest
  },
  inService: ReadonlyMap<string, string>,
  versions: readonly { version: string; is_current: boolean }[],
): Dataset {
  const manifest = row.manifest
  const credit = manifest.credits?.[0]
  const scope = manifest.scope ?? OPEN_SCOPE
  const tables = (manifest.tables ?? [])
    .filter((table) => table.role === undefined)
    .map((table) => ({ name: table.name, rows: table.rows }))

  return {
    name: row.name,
    description: manifest.description ?? null,
    version: row.version,
    "loaded-at": new Date(row.loaded_at).toISOString(),
    stale: row.stale,
    scope,
    provider: credit?.provider ?? null,
    licence: credit?.licence ?? null,
    "licence-url": credit?.licence_url ?? null,
    "source-date": credit?.updated_at ?? null,
    "source-url": credit?.url ?? null,
    tables,
    rows: tables.reduce((total, table) => total + table.rows, 0),
    "depends-on": (manifest.depends_on ?? []).map((dependency) => ({
      name: dependency.name,
      kind: dependency.kind,
      "built-against": dependency.built_against,
      "in-service": inService.get(dependency.name) ?? null,
    })),
    pivots: manifest.pivots ?? [],
    // A reserved package is put in service but cannot be downloaded
    versions: versions.map((entry) => ({
      version: entry.version,
      current: entry.is_current,
      download:
        scope === OPEN_SCOPE ? `${PACKAGES_URL}/${row.name}/${entry.version}/` : null,
    })),
    href: `/catalog/${row.name}`,
  }
}

/**
 * @returns the datasets in service, or undefined when the database has no registry of packages
 */
export async function readCatalog(db: Db): Promise<Dataset[] | undefined> {
  return Promise.all([
    db.query(
      `SELECT name, version, loaded_at, stale, manifest FROM "${META_SCHEMA}".packages ORDER BY name;`,
    ),
    db
      .query(
        `SELECT name, version, is_current FROM "${META_SCHEMA}".repository_versions ORDER BY name, version;`,
      )
      .catch(() => ({
        rows: [] as { name: string; version: string; is_current: boolean }[],
      })),
  ]).then(
    ([packages, versions]) => {
      const inService = new Map<string, string>(
        packages.rows.map((row) => [row.name, row.version]),
      )

      return packages.rows.map((row) =>
        datasetOf(
          row,
          inService,
          versions.rows.filter((entry) => entry.name === row.name),
        ),
      )
    },
    () => undefined,
  )
}
