import type { Pool } from "pg"
import { authorize, type Decision } from "./AccessControl"
import { emptyKeyStore, refreshKeyStore } from "./KeyStore"
import { emptyRateLimitState, forgetIdleCallers } from "./RateLimit"
import { setUpAccessSchema } from "./Schema"
import { emptyUsageState, flushUsage, recordUsage, restoreDailyCounts } from "./Usage"

const ONE_MINUTE_IN_MS = 60000

const IS_DISABLED = import.meta.env.ACCESS_CONTROL === "off"

const store = emptyKeyStore()
const rateLimits = emptyRateLimitState()
const usage = emptyUsageState()

/**
 * Prepares the storage and starts the periodic work. Called once, at start.
 * A database that refuses the setup leaves the API serving anonymous callers.
 */
export async function startAccessControl(db: Pool) {
  if (IS_DISABLED) {
    return
  }

  await setUpAccessSchema(db).then(
    () => undefined,
    (error: Error) =>
      console.warn("Access control storage is not available: " + error.message),
  )
  await refreshKeyStore(store, db, Date.now())
  await restoreDailyCounts(rateLimits, db, Date.now())

  setInterval(() => {
    flushUsage(usage, db)
    forgetIdleCallers(rateLimits, Date.now())
  }, ONE_MINUTE_IN_MS).unref()
}

export async function checkAccess(
  db: Pool,
  request: Request,
  ip: string,
  scope: string,
): Promise<Decision | undefined> {
  if (IS_DISABLED) {
    return undefined
  }

  const now = Date.now()
  await refreshKeyStore(store, db, now)

  return authorize(store, rateLimits, {
    authorization: request.headers.get("authorization"),
    apiKeyHeader: request.headers.get("x-api-key"),
    ip,
    scope,
    now,
  })
}

export function countRequest(decision: Decision, path: string, status: number) {
  // Nothing is recorded for a caller whose key was refused: there is no one to attribute it to
  if (decision.identity === undefined) {
    return
  }

  recordUsage(usage, {
    label: decision.identity.label,
    isKey: decision.identity.kind === "key",
    path,
    status,
    now: Date.now(),
  })
}
