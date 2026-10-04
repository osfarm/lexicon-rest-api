import type { Pool } from "pg"
import { restoreDailyCount, utcDay, type RateLimitState } from "./RateLimit"
import { ACCESS_SCHEMA } from "./Schema"

type Count = { requests: number; throttled: number; errors: number }

export type UsageState = {
  // Keyed by day, identity label and namespace, joined by a tab
  counts: Map<string, Count>
  lastUsed: Map<string, number>
}

export function emptyUsageState(): UsageState {
  return { counts: new Map(), lastUsed: new Map() }
}

/**
 * The first segment of a path: what the usage is broken down by.
 */
export function namespaceOf(path: string): string {
  return path.split("/")[1]?.split(".")[0] || "home"
}

export function recordUsage(
  state: UsageState,
  entry: { label: string; isKey: boolean; path: string; status: number; now: number },
) {
  const key = [utcDay(entry.now), entry.label, namespaceOf(entry.path)].join("\t")
  const count = state.counts.get(key) ?? { requests: 0, throttled: 0, errors: 0 }

  state.counts.set(key, {
    requests: count.requests + 1,
    throttled: count.throttled + (entry.status === 429 ? 1 : 0),
    errors: count.errors + (entry.status >= 500 ? 1 : 0),
  })
  if (entry.isKey) {
    state.lastUsed.set(entry.label, entry.now)
  }
}

/**
 * Writes what was counted since the last call, then starts counting again.
 * What could not be written is lost: usage is a statistic, not an invoice.
 */
export async function flushUsage(state: UsageState, db: Pick<Pool, "query">) {
  const counts = [...state.counts.entries()]
  const lastUsed = [...state.lastUsed.entries()]
  state.counts = new Map()
  state.lastUsed = new Map()

  await Promise.all([
    ...counts.map(([key, count]) => {
      const [day, identity, namespace] = key.split("\t")

      return db.query(
        `INSERT INTO "${ACCESS_SCHEMA}".usage_daily (day, identity, namespace, requests, throttled, errors)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (day, identity, namespace) DO UPDATE
           SET requests = usage_daily.requests + EXCLUDED.requests,
               throttled = usage_daily.throttled + EXCLUDED.throttled,
               errors = usage_daily.errors + EXCLUDED.errors;`,
        [day, identity, namespace, count.requests, count.throttled, count.errors],
      )
    }),
    ...lastUsed.map(([prefix, at]) =>
      db.query(
        `UPDATE "${ACCESS_SCHEMA}".api_keys SET last_used_at = $2 WHERE prefix = $1;`,
        [prefix, new Date(at)],
      ),
    ),
  ]).catch(() => undefined)
}

/**
 * Gives back to the keys what they already used today, after a restart.
 */
export async function restoreDailyCounts(
  rateLimits: RateLimitState,
  db: Pick<Pool, "query">,
  now: number,
) {
  const day = utcDay(now)

  await db
    .query(
      `SELECT identity, SUM(requests - throttled)::bigint AS requests
         FROM "${ACCESS_SCHEMA}".usage_daily
        WHERE day = $1 AND identity <> 'anonymous'
        GROUP BY identity;`,
      [day],
    )
    .then(
      (response) =>
        response.rows.forEach((row) =>
          restoreDailyCount(rateLimits, `key:${row.identity}`, day, Number(row.requests)),
        ),
      () => undefined,
    )
}
