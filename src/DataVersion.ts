import type { Pool } from "pg"

const META_SCHEMA = import.meta.env.DB_META_SCHEMA ?? "lexicon_meta"

const CHECK_INTERVAL_IN_MS = 30000

// Used when the database has no package registry: the data never changes under
// the API, as with a schema loaded once and for all.
const STATIC_VERSION = "static"

type Clearable = { clear: () => unknown }

type Clock = () => number

/**
 * Tells whether the data served has changed since the last look.
 *
 * Lexicon replaces the tables of a datasource while the API runs. The registry
 * of the packages in service changes at each replacement: its state is the
 * version of the data, and everything cached for another version is stale.
 */
export class DataVersion {
  protected current: string | undefined = undefined
  protected checkedAt = 0
  protected pending: Promise<void> | undefined = undefined

  constructor(
    protected cache: Clearable,
    protected now: Clock = Date.now,
    protected interval = CHECK_INTERVAL_IN_MS,
  ) {}

  /**
   * Empties the cache if the data has changed. Looks at the database at most
   * once per interval; concurrent callers share the same look.
   */
  refresh(db: Pick<Pool, "query">): Promise<void> {
    const isRecent =
      this.current !== undefined && this.now() - this.checkedAt < this.interval

    if (isRecent) {
      return Promise.resolve()
    }

    if (this.pending === undefined) {
      this.pending = this.read(db).then((version) => {
        if (this.current !== undefined && this.current !== version) {
          this.cache.clear()
        }

        this.current = version
        this.checkedAt = this.now()
        this.pending = undefined
      })
    }

    return this.pending
  }

  protected read(db: Pick<Pool, "query">): Promise<string> {
    return db
      .query(
        `SELECT COALESCE(MAX(loaded_at)::text, '') || '/' || COUNT(*) AS version FROM "${META_SCHEMA}".packages;`,
      )
      .then(
        (response) => (response.rows[0]?.version as string | undefined) ?? STATIC_VERSION,
        () => STATIC_VERSION,
      )
  }
}
