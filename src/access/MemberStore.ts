import type { Pool } from "pg"
import { generateKey } from "./ApiKey"
import { hashOfToken } from "./AdminSession"
import type { Admin, KeyRow } from "./AdminStore"
import {
  lifetimeOf,
  MEMBER_SESSION_LIFETIME_IN_MS,
  newMemberToken,
  type TokenPurpose,
} from "./MemberSession"
import type { Restrictions } from "./Restriction"
import { ACCESS_SCHEMA } from "./Schema"

// A member holds a few keys at once: one per application, with room to replace one
export const MAXIMUM_ACTIVE_KEYS = 5
// The key a member replaces keeps working for a week, the time to change it wherever it is used
export const REPLACEMENT_OVERLAP_IN_DAYS = 7
export const MAXIMUM_LABEL_LENGTH = 60

type Db = Pick<Pool, "query">

export type Member = Readonly<{
  id: string
  name: string
  email: string
  plan: string
  membership_until: string | null
  extra_scopes: string[]
  note: string | null
  has_password: boolean
  created_at: Date
  disabled_at: Date | null
  last_login_at: Date | null
}>

export type MemberSummary = Member & Readonly<{ active_keys: number }>

export type MemberKey = KeyRow &
  Readonly<{
    label: string | null
    allowed_addresses: string[]
    allowed_domains: string[]
    // Requests counted under the key over the last thirty days
    requests: string
  }>

export type NewMemberInput = Readonly<{
  name: string
  email: string
  plan: string
  membershipUntil: string | null
  extraScopes: string[]
  note: string | null
}>

const table = (name: string) => `"${ACCESS_SCHEMA}".${name}`

const MEMBER_COLUMNS = `m.id, m.name, m.email, m.plan, m.membership_until::text, m.extra_scopes, m.note,
  m.password_hash IS NOT NULL AS has_password, m.created_at, m.disabled_at, m.last_login_at`

const ACTIVE_KEY = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`

const KEY_COLUMNS = `k.prefix, k.owner_name, k.owner_email, k.plan, k.membership_until::text, k.expires_at,
  k.revoked_at, k.last_used_at, k.created_at, k.extra_scopes, k.note, k.label, k.allowed_addresses, k.allowed_domains`

/**
 * Whether the membership still runs: a member whose membership ended keeps
 * their account, and can no longer make keys.
 */
export function membershipRuns(member: Pick<Member, "membership_until">, today: string) {
  return member.membership_until === null || member.membership_until >= today
}

async function auditMember(
  db: Db,
  member: Pick<Member, "id">,
  action: string,
  target: string | null,
  detail: object = {},
) {
  await db.query(
    `INSERT INTO ${table("audit_log")} (member_id, action, target, detail) VALUES ($1, $2, $3, $4);`,
    [member.id, action, target, JSON.stringify(detail)],
  )
}

async function auditAdmin(
  db: Db,
  admin: Admin,
  action: string,
  target: string,
  detail: object = {},
) {
  await db.query(
    `INSERT INTO ${table("audit_log")} (admin_id, action, target, detail) VALUES ($1, $2, $3, $4);`,
    [admin.id, action, target, JSON.stringify(detail)],
  )
}

// --- members, as an administrator sees them

export async function listMembers(db: Db): Promise<MemberSummary[]> {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS},
            (SELECT count(*)::integer FROM ${table("api_keys")} WHERE member_id = m.id AND ${ACTIVE_KEY}) AS active_keys
       FROM ${table("members")} AS m
      ORDER BY m.disabled_at IS NOT NULL, lower(m.name);`,
  )

  return result.rows
}

export async function findMember(db: Db, id: string): Promise<Member | undefined> {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS} FROM ${table("members")} AS m WHERE m.id = $1;`,
    [/^\d{1,18}$/.test(id) ? id : null],
  )

  return result.rows[0]
}

export async function findMemberByEmail(db: Db, email: string): Promise<Member | undefined> {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS} FROM ${table("members")} AS m WHERE lower(m.email) = lower($1);`,
    [email],
  )

  return result.rows[0]
}

/**
 * Creates the account of a member, and gives them the keys an administrator
 * had already delivered to the same e-mail address.
 * @returns undefined when the address already has an account
 */
export async function createMember(
  db: Db,
  admin: Admin,
  input: NewMemberInput,
): Promise<Member | undefined> {
  if ((await findMemberByEmail(db, input.email)) !== undefined) {
    return undefined
  }

  const created = await db.query(
    `INSERT INTO ${table("members")} (name, email, plan, membership_until, extra_scopes, note, created_by)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7) RETURNING id;`,
    [
      input.name,
      input.email,
      input.plan,
      input.membershipUntil,
      input.extraScopes,
      input.note,
      admin.id,
    ],
  )
  const id = String(created.rows[0].id)
  const adopted = await db.query(
    `UPDATE ${table("api_keys")} SET member_id = $1 WHERE member_id IS NULL AND lower(owner_email) = lower($2);`,
    [id, input.email],
  )

  await auditAdmin(db, admin, "member.create", id, {
    name: input.name,
    plan: input.plan,
    adoptedKeys: adopted.rowCount,
  })

  return findMember(db, id)
}

/**
 * Renews or shortens a membership. The keys of the member follow, except the
 * ones being replaced, which end sooner on purpose.
 */
export async function extendMembership(db: Db, admin: Admin, member: Member, until: string) {
  await db.query(
    `UPDATE ${table("api_keys")}
        SET membership_until = $2::date, expires_at = ($2::date + 1)::timestamptz
      WHERE member_id = $1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at = (membership_until + 1)::timestamptz);`,
    [member.id, until],
  )
  await db.query(`UPDATE ${table("members")} SET membership_until = $2::date WHERE id = $1;`, [
    member.id,
    until,
  ])
  await auditAdmin(db, admin, "member.extend", member.id, { until })
}

export async function changeMemberPlan(db: Db, admin: Admin, member: Member, plan: string) {
  await db.query(`UPDATE ${table("members")} SET plan = $2 WHERE id = $1;`, [member.id, plan])
  await db.query(
    `UPDATE ${table("api_keys")} SET plan = $2 WHERE member_id = $1 AND revoked_at IS NULL;`,
    [member.id, plan],
  )
  await auditAdmin(db, admin, "member.plan", member.id, { plan })
}

/**
 * Closes an account: its keys are revoked, its sessions and pending links are gone.
 */
export async function disableMember(db: Db, admin: Admin, member: Member) {
  await db.query(
    `UPDATE ${table("members")} SET disabled_at = now() WHERE id = $1 AND disabled_at IS NULL;`,
    [member.id],
  )
  await db.query(
    `UPDATE ${table("api_keys")} SET revoked_at = now() WHERE member_id = $1 AND revoked_at IS NULL;`,
    [member.id],
  )
  await db.query(`DELETE FROM ${table("member_sessions")} WHERE member_id = $1;`, [member.id])
  await db.query(`DELETE FROM ${table("member_tokens")} WHERE member_id = $1;`, [member.id])
  await auditAdmin(db, admin, "member.disable", member.id)
}

/**
 * Opens an account again. The keys revoked when it was closed stay revoked.
 */
export async function enableMember(db: Db, admin: Admin, member: Member) {
  await db.query(`UPDATE ${table("members")} SET disabled_at = NULL WHERE id = $1;`, [
    member.id,
  ])
  await auditAdmin(db, admin, "member.enable", member.id)
}

export function noteInvitation(db: Db, admin: Admin, member: Member, sent: boolean) {
  return auditAdmin(db, admin, "member.invite", member.id, { sent })
}

// --- links sent by e-mail

/**
 * A new link to choose a password. The earlier links of the member stop working.
 * @returns the token to put in the link: only its hash is stored
 */
export async function issueToken(
  db: Db,
  memberId: string,
  purpose: TokenPurpose,
  now: number,
): Promise<string> {
  const token = newMemberToken()

  await db.query(
    `DELETE FROM ${table("member_tokens")} WHERE member_id = $1 OR expires_at < now() - interval '30 days';`,
    [memberId],
  )
  await db.query(
    `INSERT INTO ${table("member_tokens")} (token_hash, member_id, purpose, expires_at) VALUES ($1, $2, $3, $4);`,
    [hashOfToken(token), memberId, purpose, new Date(now + lifetimeOf(purpose))],
  )

  return token
}

export async function findTokenMember(db: Db, token: string): Promise<Member | undefined> {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS}
       FROM ${table("member_tokens")} AS t
       JOIN ${table("members")} AS m ON m.id = t.member_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND m.disabled_at IS NULL;`,
    [hashOfToken(token)],
  )

  return result.rows[0]
}

/**
 * Records the password chosen from a link. The link serves once, and the
 * sessions opened with the former password are closed.
 * @returns the member, undefined when the link no longer works
 */
export async function choosePassword(
  db: Db,
  token: string,
  passwordHash: string,
): Promise<Member | undefined> {
  const used = await db.query(
    `UPDATE ${table("member_tokens")} AS t SET used_at = now()
       FROM ${table("members")} AS m
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
        AND m.id = t.member_id AND m.disabled_at IS NULL
      RETURNING t.member_id;`,
    [hashOfToken(token)],
  )
  const memberId = used.rows[0]?.member_id

  if (memberId === undefined) {
    return undefined
  }

  await setPassword(db, String(memberId), passwordHash)
  await auditMember(db, { id: String(memberId) }, "member.password", null, { from: "link" })

  return findMember(db, String(memberId))
}

async function setPassword(db: Db, memberId: string, passwordHash: string) {
  await db.query(`UPDATE ${table("members")} SET password_hash = $2 WHERE id = $1;`, [
    memberId,
    passwordHash,
  ])
  await db.query(`DELETE FROM ${table("member_sessions")} WHERE member_id = $1;`, [memberId])
}

export async function changePassword(db: Db, member: Member, passwordHash: string) {
  await setPassword(db, member.id, passwordHash)
  await auditMember(db, member, "member.password", null, { from: "account" })
}

// --- sessions

export async function findMemberToLogIn(db: Db, email: string) {
  const result = await db.query(
    `SELECT id, password_hash FROM ${table("members")}
      WHERE lower(email) = lower($1) AND disabled_at IS NULL AND password_hash IS NOT NULL;`,
    [email],
  )

  return result.rows[0] as { id: string; password_hash: string } | undefined
}

export async function passwordHashOf(db: Db, member: Member): Promise<string | undefined> {
  const result = await db.query(
    `SELECT password_hash FROM ${table("members")} WHERE id = $1;`,
    [member.id],
  )

  return result.rows[0]?.password_hash ?? undefined
}

export async function openMemberSession(db: Db, memberId: string, token: string, now: number) {
  await db.query(`DELETE FROM ${table("member_sessions")} WHERE expires_at < now();`)
  await db.query(
    `INSERT INTO ${table("member_sessions")} (token_hash, member_id, expires_at) VALUES ($1, $2, $3);`,
    [hashOfToken(token), memberId, new Date(now + MEMBER_SESSION_LIFETIME_IN_MS)],
  )
  await db.query(`UPDATE ${table("members")} SET last_login_at = now() WHERE id = $1;`, [
    memberId,
  ])
}

export async function findSessionMember(db: Db, token: string): Promise<Member | undefined> {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS}
       FROM ${table("member_sessions")} AS s
       JOIN ${table("members")} AS m ON m.id = s.member_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND m.disabled_at IS NULL;`,
    [hashOfToken(token)],
  )

  return result.rows[0]
}

export async function closeMemberSession(db: Db, token: string) {
  await db.query(`DELETE FROM ${table("member_sessions")} WHERE token_hash = $1;`, [
    hashOfToken(token),
  ])
}

// --- the keys of a member

export async function memberKeys(db: Db, memberId: string): Promise<MemberKey[]> {
  const result = await db.query(
    `SELECT ${KEY_COLUMNS},
            COALESCE((SELECT sum(requests) FROM ${table("usage_daily")}
                       WHERE identity = k.prefix AND day > current_date - 30), 0)::text AS requests
       FROM ${table("api_keys")} AS k
      WHERE k.member_id = $1
      ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC;`,
    [memberId],
  )

  return result.rows
}

async function insertKey(
  db: Db,
  member: Member,
  label: string,
  restrictions: Restrictions,
  ceiling: number,
) {
  const key = generateKey()
  // The count and the insertion are one statement: two requests at once cannot both pass under the ceiling
  const inserted = await db.query(
    `INSERT INTO ${table("api_keys")}
       (prefix, secret_hash, plan, owner_name, owner_email, membership_until, expires_at, extra_scopes,
        member_id, label, allowed_addresses, allowed_domains)
     SELECT $1, $2, m.plan, m.name, m.email, m.membership_until, (m.membership_until + 1)::timestamptz,
            m.extra_scopes, m.id, $4, $5, $6
       FROM ${table("members")} AS m
      WHERE m.id = $3 AND m.disabled_at IS NULL
        AND (m.membership_until IS NULL OR m.membership_until >= current_date)
        AND (SELECT count(*) FROM ${table("api_keys")} WHERE member_id = m.id AND ${ACTIVE_KEY}) < $7
     RETURNING prefix;`,
    [
      key.prefix,
      key.secretHash,
      member.id,
      label,
      restrictions.addresses,
      restrictions.domains,
      ceiling,
    ],
  )

  return inserted.rowCount === 1 ? { key: key.key, prefix: key.prefix } : undefined
}

/**
 * A new key for the member, with their plan and the end of their membership.
 * @returns the full key, to show once; undefined when the member holds as many
 * keys as allowed, or when their membership ended
 */
export async function createMemberKey(
  db: Db,
  member: Member,
  label: string,
  restrictions: Restrictions,
) {
  const created = await insertKey(db, member, label, restrictions, MAXIMUM_ACTIVE_KEYS)

  if (created !== undefined) {
    await auditMember(db, member, "key.create", created.prefix, { label })
  }

  return created
}

export async function findMemberKey(
  db: Db,
  member: Member,
  prefix: string,
): Promise<MemberKey | undefined> {
  return (await memberKeys(db, member.id)).find((key) => key.prefix === prefix)
}

export async function revokeMemberKey(db: Db, member: Member, prefix: string) {
  const revoked = await db.query(
    `UPDATE ${table("api_keys")} SET revoked_at = now()
      WHERE prefix = $1 AND member_id = $2 AND revoked_at IS NULL;`,
    [prefix, member.id],
  )

  if (revoked.rowCount === 1) {
    await auditMember(db, member, "key.revoke", prefix)
  }
}

/**
 * Gives a key a new secret: a new key with the same label and restrictions,
 * the old one working for a week more. The old key being still counted, a
 * member at the ceiling may go over it by replacing, never twice over.
 */
export async function replaceMemberKey(db: Db, member: Member, old: MemberKey) {
  const created = await insertKey(
    db,
    member,
    old.label ?? "",
    { addresses: old.allowed_addresses, domains: old.allowed_domains },
    2 * MAXIMUM_ACTIVE_KEYS,
  )

  if (created === undefined) {
    return undefined
  }

  await db.query(
    `UPDATE ${table("api_keys")}
        SET expires_at = LEAST(COALESCE(expires_at, 'infinity'), now() + interval '${REPLACEMENT_OVERLAP_IN_DAYS} days')
      WHERE prefix = $1 AND member_id = $2;`,
    [old.prefix, member.id],
  )
  await auditMember(db, member, "key.renew", old.prefix, { replacedBy: created.prefix })

  return created
}

export async function describeMemberKey(
  db: Db,
  member: Member,
  prefix: string,
  label: string,
  restrictions: Restrictions,
) {
  const changed = await db.query(
    `UPDATE ${table("api_keys")} SET label = $3, allowed_addresses = $4, allowed_domains = $5
      WHERE prefix = $1 AND member_id = $2 AND revoked_at IS NULL;`,
    [prefix, member.id, label, restrictions.addresses, restrictions.domains],
  )

  if (changed.rowCount === 1) {
    await auditMember(db, member, "key.restrict", prefix, { label, ...restrictions })
  }
}
