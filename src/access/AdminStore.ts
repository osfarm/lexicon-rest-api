import type { Pool } from "pg"
import { generateKey } from "./ApiKey"
import { hashOfToken, SESSION_LIFETIME_IN_MS } from "./AdminSession"
import { ACCESS_SCHEMA } from "./Schema"

const META_SCHEMA = import.meta.env.DB_META_SCHEMA ?? "lexicon_meta"
const RENEWAL_OVERLAP_IN_DAYS = 7

type Db = Pick<Pool, "query">

export type Admin = Readonly<{ id: string; email: string }>

export type KeyRow = Readonly<{
  prefix: string
  owner_name: string
  owner_email: string
  plan: string
  membership_until: string | null
  expires_at: Date | null
  revoked_at: Date | null
  last_used_at: Date | null
  created_at: Date
  extra_scopes: string[]
  note: string | null
}>

export type NewKeyInput = Readonly<{
  ownerName: string
  ownerEmail: string
  plan: string
  membershipUntil: string | null
  extraScopes: string[]
  note: string | null
}>

const table = (name: string) => `"${ACCESS_SCHEMA}".${name}`

// --- administrators and sessions

export async function findAdminToLogIn(db: Db, email: string) {
  const result = await db.query(
    `SELECT id, email, password_hash FROM ${table("admins")} WHERE lower(email) = lower($1) AND disabled_at IS NULL;`,
    [email],
  )

  return result.rows[0] as
    { id: string; email: string; password_hash: string } | undefined
}

export async function createAdmin(db: Db, email: string, passwordHash: string) {
  await db.query(
    `INSERT INTO ${table("admins")} (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, disabled_at = NULL;`,
    [email, passwordHash],
  )
}

export async function disableAdmin(db: Db, email: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE ${table("admins")} SET disabled_at = now() WHERE lower(email) = lower($1) AND disabled_at IS NULL RETURNING id;`,
    [email],
  )
  await db.query(`DELETE FROM ${table("sessions")} WHERE admin_id = ANY($1::bigint[]);`, [
    result.rows.map((row) => row.id),
  ])

  return result.rowCount === 1
}

export async function openSession(db: Db, adminId: string, token: string, now: number) {
  await db.query(`DELETE FROM ${table("sessions")} WHERE expires_at < now();`)
  await db.query(
    `INSERT INTO ${table("sessions")} (token_hash, admin_id, expires_at) VALUES ($1, $2, $3);`,
    [hashOfToken(token), adminId, new Date(now + SESSION_LIFETIME_IN_MS)],
  )
}

export async function findSessionAdmin(
  db: Db,
  token: string,
): Promise<Admin | undefined> {
  const result = await db.query(
    `SELECT admins.id, admins.email
       FROM ${table("sessions")} AS sessions
       JOIN ${table("admins")} AS admins ON admins.id = sessions.admin_id
      WHERE sessions.token_hash = $1 AND sessions.expires_at > now() AND admins.disabled_at IS NULL;`,
    [hashOfToken(token)],
  )

  return result.rows[0]
}

export async function closeSession(db: Db, token: string) {
  await db.query(`DELETE FROM ${table("sessions")} WHERE token_hash = $1;`, [
    hashOfToken(token),
  ])
}

export async function audit(
  db: Db,
  admin: Admin,
  action: string,
  target: string | null,
  detail: object = {},
) {
  await db.query(
    `INSERT INTO ${table("audit_log")} (admin_id, action, target, detail) VALUES ($1, $2, $3, $4);`,
    [admin.id, action, target, JSON.stringify(detail)],
  )
}

export async function auditLog(db: Db) {
  const result = await db.query(
    `SELECT audit.at, admins.email, audit.action, audit.target, audit.detail
       FROM ${table("audit_log")} AS audit
       LEFT JOIN ${table("admins")} AS admins ON admins.id = audit.admin_id
      ORDER BY audit.id DESC LIMIT 200;`,
  )

  return result.rows as {
    at: Date
    email: string | null
    action: string
    target: string | null
    detail: object
  }[]
}

// --- keys

const KEY_COLUMNS = `prefix, owner_name, owner_email, plan, membership_until::text, expires_at, revoked_at, last_used_at, created_at, extra_scopes, note`

export async function listKeys(db: Db): Promise<KeyRow[]> {
  const result = await db.query(
    `SELECT ${KEY_COLUMNS} FROM ${table("api_keys")} ORDER BY revoked_at IS NOT NULL, owner_name, created_at;`,
  )

  return result.rows
}

export async function findKey(db: Db, prefix: string): Promise<KeyRow | undefined> {
  const result = await db.query(
    `SELECT ${KEY_COLUMNS} FROM ${table("api_keys")} WHERE prefix = $1;`,
    [prefix],
  )

  return result.rows[0]
}

/**
 * @returns the full key, to show once: it cannot be read again afterwards
 */
export async function createKey(
  db: Db,
  admin: Admin,
  input: NewKeyInput,
): Promise<{ key: string; prefix: string }> {
  const key = generateKey()

  await db.query(
    `INSERT INTO ${table("api_keys")}
       (prefix, secret_hash, plan, owner_name, owner_email, membership_until, expires_at, extra_scopes, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::date, ($6::date + 1)::timestamptz, $7, $8, $9);`,
    [
      key.prefix,
      key.secretHash,
      input.plan,
      input.ownerName,
      input.ownerEmail,
      input.membershipUntil,
      input.extraScopes,
      input.note,
      admin.id,
    ],
  )
  await audit(db, admin, "key.create", key.prefix, {
    owner: input.ownerName,
    plan: input.plan,
  })

  return { key: key.key, prefix: key.prefix }
}

export async function revokeKey(db: Db, admin: Admin, prefix: string) {
  await db.query(
    `UPDATE ${table("api_keys")} SET revoked_at = now() WHERE prefix = $1 AND revoked_at IS NULL;`,
    [prefix],
  )
  await audit(db, admin, "key.revoke", prefix)
}

export async function extendKey(
  db: Db,
  admin: Admin,
  prefix: string,
  membershipUntil: string,
) {
  await db.query(
    `UPDATE ${table("api_keys")}
        SET membership_until = $2::date, expires_at = ($2::date + 1)::timestamptz
      WHERE prefix = $1;`,
    [prefix, membershipUntil],
  )
  await audit(db, admin, "key.extend", prefix, { until: membershipUntil })
}

export async function changeKeyPlan(db: Db, admin: Admin, prefix: string, plan: string) {
  await db.query(`UPDATE ${table("api_keys")} SET plan = $2 WHERE prefix = $1;`, [
    prefix,
    plan,
  ])
  await audit(db, admin, "key.plan", prefix, { plan })
}

/**
 * Gives the owner of a key a new one. The old key keeps working for a week,
 * the time to replace it wherever it is used.
 */
export async function renewKey(
  db: Db,
  admin: Admin,
  old: KeyRow,
): Promise<{ key: string; prefix: string }> {
  const created = await createKey(db, admin, {
    ownerName: old.owner_name,
    ownerEmail: old.owner_email,
    plan: old.plan,
    membershipUntil: old.membership_until,
    extraScopes: old.extra_scopes,
    note: old.note,
  })

  await db.query(
    `UPDATE ${table("api_keys")}
        SET expires_at = LEAST(COALESCE(expires_at, 'infinity'), now() + interval '${RENEWAL_OVERLAP_IN_DAYS} days')
      WHERE prefix = $1;`,
    [old.prefix],
  )
  await audit(db, admin, "key.renew", old.prefix, { replacedBy: created.prefix })

  return created
}

// --- plans

export type PlanRow = Readonly<{
  name: string
  per_minute: number | null
  per_day: number | null
  max_page_size: number
  statement_timeout_ms: number
  scopes: string[]
}>

export async function listPlans(db: Db): Promise<PlanRow[]> {
  const result = await db.query(
    `SELECT * FROM ${table("plans")} ORDER BY per_minute NULLS LAST, name;`,
  )

  return result.rows
}

export async function updatePlan(
  db: Db,
  admin: Admin,
  name: string,
  limits: { perMinute: number | null; perDay: number | null; scopes: string[] },
) {
  await db.query(
    `UPDATE ${table("plans")} SET per_minute = $2, per_day = $3, scopes = $4 WHERE name = $1;`,
    [name, limits.perMinute, limits.perDay, limits.scopes],
  )
  await audit(db, admin, "plan.update", name, limits)
}

// --- usage

export type UsageRow = Readonly<{
  day: string
  identity: string
  namespace: string
  requests: string
  throttled: string
  errors: string
}>

export async function usageOf(
  db: Db,
  days: number,
  identity?: string,
): Promise<UsageRow[]> {
  const result = await db.query(
    `SELECT day::text, identity, namespace, requests, throttled, errors
       FROM ${table("usage_daily")}
      WHERE day > current_date - $1::integer AND ($2::varchar IS NULL OR identity = $2)
      ORDER BY day DESC, requests DESC;`,
    [days, identity ?? null],
  )

  return result.rows
}

export async function todaySummary(db: Db) {
  const usage = await db.query(
    `SELECT COALESCE(SUM(requests), 0)::bigint AS requests, COALESCE(SUM(throttled), 0)::bigint AS throttled,
            COALESCE(SUM(errors), 0)::bigint AS errors
       FROM ${table("usage_daily")} WHERE day = current_date;`,
  )
  const keys = await db.query(
    `SELECT COUNT(*) FILTER (WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active,
            COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at BETWEEN now() AND now() + interval '30 days') AS expiring
       FROM ${table("api_keys")};`,
  )

  return {
    requests: Number(usage.rows[0].requests),
    throttled: Number(usage.rows[0].throttled),
    errors: Number(usage.rows[0].errors),
    activeKeys: Number(keys.rows[0].active),
    expiringKeys: Number(keys.rows[0].expiring),
  }
}

// --- datasources, from the registry of the loader

export type PackageRow = Readonly<{
  name: string
  version: string
  loaded_at: Date
  stale: boolean
}>

export type LoadRow = Readonly<{
  name: string
  version: string
  previous: string | null
  started_at: Date
  state: string
  detail: { reasons?: string[]; total_seconds?: number } | null
}>

/**
 * @returns undefined when the database has no registry of packages
 */
export async function datasources(
  db: Db,
): Promise<{ packages: PackageRow[]; loads: LoadRow[] } | undefined> {
  return Promise.all([
    db.query(
      `SELECT name, version, loaded_at, stale FROM "${META_SCHEMA}".packages ORDER BY name;`,
    ),
    db.query(
      `SELECT name, version, previous, started_at, state, detail FROM "${META_SCHEMA}".loads ORDER BY id DESC LIMIT 30;`,
    ),
  ]).then(
    ([packages, loads]) => ({ packages: packages.rows, loads: loads.rows }),
    () => undefined,
  )
}
