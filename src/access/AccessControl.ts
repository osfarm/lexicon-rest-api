import { match } from "shulk"
import { parseKey, secretMatches } from "./ApiKey"
import type { KeyStore } from "./KeyStore"
import { ANONYMOUS_PLAN, ANONYMOUS_PLAN_NAME, OPEN_SCOPE, type Plan } from "./Plan"
import { consume, type RateLimitState, type RateLimitVerdict } from "./RateLimit"

export type Identity = Readonly<{
  // "key" for the holder of an API key, "anonymous" otherwise
  kind: "key" | "anonymous"
  // What the allowance is counted against: the key prefix, or the IP address
  caller: string
  // What the usage is recorded under: the key prefix, or "anonymous". No IP address is ever stored
  label: string
  plan: Plan
  scopes: readonly string[]
}>

export type Denial = Readonly<{
  status: 401 | 403 | 429 | 503
  message: string
  headers: Record<string, string>
}>

export type Decision =
  | Readonly<{ allowed: true; identity: Identity; headers: Record<string, string> }>
  | Readonly<{ allowed: false; identity: Identity | undefined; denial: Denial }>

export type AccessRequest = Readonly<{
  authorization: string | null
  apiKeyHeader: string | null
  ip: string
  scope: string
  now: number
}>

export function anonymousIdentity(ip: string, plan: Plan = ANONYMOUS_PLAN): Identity {
  return {
    kind: "anonymous",
    caller: `ip:${ip}`,
    label: ANONYMOUS_PLAN_NAME,
    plan,
    scopes: plan.scopes,
  }
}

function presentedKey(request: AccessRequest): string | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.authorization ?? "")

  return bearer !== null ? bearer[1] : request.apiKeyHeader
}

function deny(status: Denial["status"], message: string, headers = {}): Denial {
  return { status, message, headers }
}

/**
 * Tells who is calling. A key that is presented must be valid: a wrong key is
 * refused rather than served as an anonymous caller.
 */
export function identify(store: KeyStore, request: AccessRequest): Identity | Denial {
  const key = presentedKey(request)
  const anonymousPlan = store.plans.get(ANONYMOUS_PLAN_NAME) ?? ANONYMOUS_PLAN

  if (key === null || key.trim() === "") {
    return anonymousIdentity(request.ip, anonymousPlan)
  }

  if (!store.available) {
    return deny(503, "API keys cannot be checked for now, try again later")
  }

  const parsed = parseKey(key)
  if (parsed._state === "Err") {
    return deny(401, "Malformed API key")
  }

  const { prefix, secret } = parsed.val
  const stored = store.keys.get(prefix)
  const plan = stored === undefined ? undefined : store.plans.get(stored.plan)

  if (
    stored === undefined ||
    plan === undefined ||
    !secretMatches(secret, stored.secretHash)
  ) {
    return deny(401, "Unknown API key")
  }
  if (stored.revokedAt !== null && stored.revokedAt <= request.now) {
    return deny(401, "This API key has been revoked")
  }
  if (stored.expiresAt !== null && stored.expiresAt <= request.now) {
    return deny(401, "This API key has expired")
  }

  return {
    kind: "key",
    caller: `key:${prefix}`,
    label: prefix,
    plan,
    scopes: [...plan.scopes, ...stored.extraScopes],
  }
}

function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  return verdict.limit === null
    ? {}
    : {
        "RateLimit-Limit": String(verdict.limit),
        "RateLimit-Remaining": String(verdict.remaining ?? 0),
        "RateLimit-Reset": String(verdict.resetInSeconds),
      }
}

/**
 * Decides whether a request is served: who calls, whether the resource is in
 * their scopes, and whether their allowance is not exhausted.
 */
export function authorize(
  store: KeyStore,
  rateLimits: RateLimitState,
  request: AccessRequest,
): Decision {
  const identity = identify(store, request)

  if ("status" in identity) {
    return { allowed: false, identity: undefined, denial: identity }
  }

  const required = request.scope
  if (required !== OPEN_SCOPE && !identity.scopes.includes(required)) {
    const denial = match(identity.kind).with({
      anonymous: deny(401, "This resource needs an API key", {
        "WWW-Authenticate": 'Bearer realm="lexicon"',
      }),
      key: deny(403, "This API key does not give access to this resource"),
    })

    return { allowed: false, identity, denial }
  }

  const verdict = consume(rateLimits, identity.caller, identity.plan, request.now)
  const headers = rateLimitHeaders(verdict)

  if (!verdict.allowed) {
    const message =
      verdict.reason === "day"
        ? "Daily allowance exhausted"
        : "Too many requests, slow down"

    return {
      allowed: false,
      identity,
      denial: deny(429, message, {
        ...headers,
        "Retry-After": String(verdict.resetInSeconds),
      }),
    }
  }

  return { allowed: true, identity, headers }
}
