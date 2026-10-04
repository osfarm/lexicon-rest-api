import type { Pool } from "pg"
import { ANONYMOUS_PLAN, ANONYMOUS_PLAN_NAME, type Plan } from "./Plan"
import { ACCESS_SCHEMA } from "./Schema"

const REFRESH_INTERVAL_IN_MS = 30000

export type StoredKey = Readonly<{
  prefix: string
  secretHash: string
  plan: string
  extraScopes: readonly string[]
  expiresAt: number | null
  revokedAt: number | null
}>

export type KeyStore = {
  keys: Map<string, StoredKey>
  plans: Map<string, Plan>
  // False until the keys could be read once: no key can be checked before
  available: boolean
  refreshedAt: number
  pending: Promise<void> | undefined
}

export function emptyKeyStore(): KeyStore {
  return {
    keys: new Map(),
    plans: new Map([[ANONYMOUS_PLAN_NAME, ANONYMOUS_PLAN]]),
    available: false,
    refreshedAt: 0,
    pending: undefined,
  }
}

function toTime(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : new Date(value as string).getTime()
}

async function read(store: KeyStore, db: Pick<Pool, "query">) {
  const plans = await db.query(`SELECT * FROM "${ACCESS_SCHEMA}".plans;`)
  const keys = await db.query(
    `SELECT prefix, secret_hash, plan, extra_scopes, expires_at, revoked_at FROM "${ACCESS_SCHEMA}".api_keys;`,
  )

  store.plans = new Map(
    plans.rows.map((row) => [
      row.name,
      {
        name: row.name,
        perMinute: row.per_minute,
        perDay: row.per_day,
        maxPageSize: row.max_page_size,
        statementTimeoutMs: row.statement_timeout_ms,
        scopes: row.scopes,
      },
    ]),
  )
  store.keys = new Map(
    keys.rows.map((row) => [
      row.prefix,
      {
        prefix: row.prefix,
        secretHash: row.secret_hash,
        plan: row.plan,
        extraScopes: row.extra_scopes,
        expiresAt: toTime(row.expires_at),
        revokedAt: toTime(row.revoked_at),
      },
    ]),
  )
  store.available = true
}

/**
 * Keeps the keys and plans in memory, read again at most every 30 seconds: a
 * revocation takes effect within a minute, without a query per request.
 * When the database cannot be read, the last known keys stay in use.
 */
export function refreshKeyStore(
  store: KeyStore,
  db: Pick<Pool, "query">,
  now: number,
): Promise<void> {
  const isRecent =
    store.refreshedAt !== 0 && now - store.refreshedAt < REFRESH_INTERVAL_IN_MS

  if (isRecent) {
    return Promise.resolve()
  }

  if (store.pending === undefined) {
    store.pending = read(store, db)
      .catch(() => undefined)
      .then(() => {
        store.refreshedAt = now
        store.pending = undefined
      })
  }

  return store.pending
}
