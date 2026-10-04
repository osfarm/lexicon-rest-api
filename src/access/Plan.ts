export type Plan = Readonly<{
  name: string
  perMinute: number | null
  perDay: number | null
  maxPageSize: number
  statementTimeoutMs: number
  scopes: readonly string[]
}>

export const OPEN_SCOPE = "open"
export const MEMBERS_SCOPE = "members"
// Paths of the administration: no key gives it, they have their own sessions
export const ADMIN_SCOPE = "admin"
export const ANONYMOUS_PLAN_NAME = "anonymous"

// What a caller without key gets, also when the plans cannot be read
export const ANONYMOUS_PLAN: Plan = {
  name: ANONYMOUS_PLAN_NAME,
  perMinute: 30,
  perDay: 2000,
  maxPageSize: 150,
  statementTimeoutMs: 5000,
  scopes: [OPEN_SCOPE],
}

// Seeded once in the database; edited there afterwards
export const INITIAL_PLANS: readonly Plan[] = [
  ANONYMOUS_PLAN,
  {
    name: "standard",
    perMinute: 120,
    perDay: 20000,
    maxPageSize: 1000,
    statementTimeoutMs: 30000,
    scopes: [OPEN_SCOPE, MEMBERS_SCOPE],
  },
  {
    name: "partner",
    perMinute: 600,
    perDay: 200000,
    maxPageSize: 5000,
    statementTimeoutMs: 30000,
    scopes: [OPEN_SCOPE, MEMBERS_SCOPE],
  },
  {
    name: "internal",
    perMinute: null,
    perDay: null,
    maxPageSize: 10000,
    statementTimeoutMs: 60000,
    scopes: [OPEN_SCOPE, MEMBERS_SCOPE],
  },
]
