import { describe, expect, test } from "bun:test"
import { authorize, type AccessRequest } from "./AccessControl"
import { generateKey, parseKey, secretMatches } from "./ApiKey"
import { emptyKeyStore, type KeyStore, type StoredKey } from "./KeyStore"
import { INITIAL_PLANS } from "./Plan"
import { emptyRateLimitState } from "./RateLimit"

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0)

function storeWith(keys: StoredKey[] = []): KeyStore {
  return {
    ...emptyKeyStore(),
    available: true,
    plans: new Map(INITIAL_PLANS.map((plan) => [plan.name, plan])),
    keys: new Map(keys.map((key) => [key.prefix, key])),
  }
}

function member(overrides: Partial<StoredKey> = {}) {
  const key = generateKey()
  const stored: StoredKey = {
    prefix: key.prefix,
    secretHash: key.secretHash,
    plan: "standard",
    extraScopes: [],
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }

  return { key: key.key, stored }
}

const request = (overrides: Partial<AccessRequest> = {}): AccessRequest => ({
  authorization: null,
  apiKeyHeader: null,
  ip: "203.0.113.7",
  scope: "open",
  now: NOW,
  ...overrides,
})

describe("API keys", () => {
  test("a generated key has the documented shape and matches its hash only", () => {
    const key = generateKey()
    const parsed = parseKey(key.key)

    expect(key.key).toMatch(/^lex_[a-z0-9]{8}_[A-Za-z0-9]{32}$/)
    expect(parsed._state).toBe("Ok")
    expect(parsed.val).toEqual({ prefix: key.prefix, secret: key.key.slice(13) })
    expect(secretMatches(key.key.slice(13), key.secretHash)).toBe(true)
    expect(secretMatches("x".repeat(32), key.secretHash)).toBe(false)
    expect(key.secretHash).not.toContain(key.key.slice(13))
  })

  test("anything else is not a key", () => {
    expect(parseKey("lex_short_secret")._state).toBe("Err")
    expect(parseKey("Bearer nothing")._state).toBe("Err")
  })
})

describe("authorize", () => {
  test("a caller without key is anonymous, counted by address, recorded without it", () => {
    const decision = authorize(storeWith(), emptyRateLimitState(), request())

    expect(decision.allowed).toBe(true)
    expect(decision.identity?.kind).toBe("anonymous")
    expect(decision.identity?.caller).toBe("ip:203.0.113.7")
    expect(decision.identity?.label).toBe("anonymous")
    expect(decision.allowed && decision.headers["RateLimit-Limit"]).toBe("30")
    expect(decision.allowed && decision.headers["RateLimit-Remaining"]).toBe("29")
  })

  test("a valid key is accepted in either header and gets the limits of its plan", () => {
    const { key, stored } = member()
    const store = storeWith([stored])

    const bearer = authorize(
      store,
      emptyRateLimitState(),
      request({ authorization: `Bearer ${key}` }),
    )
    const header = authorize(store, emptyRateLimitState(), request({ apiKeyHeader: key }))

    expect(bearer.identity?.label).toBe(stored.prefix)
    expect(header.identity?.label).toBe(stored.prefix)
    expect(bearer.allowed && bearer.headers["RateLimit-Limit"]).toBe("120")
    expect(bearer.identity?.scopes).toContain("members")
  })

  test("a wrong, revoked or expired key is refused, not served as anonymous", () => {
    const valid = member()
    const revoked = member({ revokedAt: NOW - 1000 })
    const expired = member({ expiresAt: NOW - 1000 })
    const store = storeWith([valid.stored, revoked.stored, expired.stored])
    const tampered = valid.key.slice(0, -1) + (valid.key.endsWith("A") ? "B" : "A")
    const refusals = [
      tampered,
      revoked.key,
      expired.key,
      "not-a-key",
      generateKey().key,
    ].map((key) =>
      authorize(store, emptyRateLimitState(), request({ apiKeyHeader: key })),
    )

    expect(refusals.map((d) => d.allowed)).toEqual([false, false, false, false, false])
    expect(refusals.map((d) => !d.allowed && d.denial.status)).toEqual([
      401, 401, 401, 401, 401,
    ])
    expect(refusals.map((d) => !d.allowed && d.denial.message)).toEqual([
      "Unknown API key",
      "This API key has been revoked",
      "This API key has expired",
      "Malformed API key",
      "Unknown API key",
    ])
  })

  test("a key expiring in the future still works", () => {
    const { key, stored } = member({ expiresAt: NOW + 1000 })

    expect(
      authorize(
        storeWith([stored]),
        emptyRateLimitState(),
        request({ apiKeyHeader: key }),
      ).allowed,
    ).toBe(true)
  })

  test("a reserved resource asks anonymous callers for a key and serves members", () => {
    const { key, stored } = member()
    const store = storeWith([stored])

    const anonymous = authorize(
      store,
      emptyRateLimitState(),
      request({ scope: "members" }),
    )
    const withKey = authorize(
      store,
      emptyRateLimitState(),
      request({ scope: "members", apiKeyHeader: key }),
    )

    expect(!anonymous.allowed && anonymous.denial.status).toBe(401)
    expect(!anonymous.allowed && anonymous.denial.headers["WWW-Authenticate"]).toContain(
      "Bearer",
    )
    expect(withKey.allowed).toBe(true)
  })

  test("a scope outside the plan is forbidden unless granted to the key", () => {
    const plain = member()
    const granted = member({ extraScopes: ["bundle:cultia"] })
    const store = storeWith([plain.stored, granted.stored])
    const ask = (key: string) =>
      authorize(
        store,
        emptyRateLimitState(),
        request({ scope: "bundle:cultia", apiKeyHeader: key }),
      )

    expect(!ask(plain.key).allowed && (ask(plain.key) as any).denial.status).toBe(403)
    expect(ask(granted.key).allowed).toBe(true)
  })

  test("a refusal for scope does not consume the allowance", () => {
    const state = emptyRateLimitState()
    const store = storeWith()

    authorize(store, state, request({ scope: "members" }))
    const next = authorize(store, state, request())

    expect(next.allowed && next.headers["RateLimit-Remaining"]).toBe("29")
  })

  test("past the limit the caller gets 429 with the time to wait", () => {
    const state = emptyRateLimitState()
    const store = storeWith()
    const decisions = Array.from({ length: 31 }, () => authorize(store, state, request()))
    const last = decisions[30]

    expect(decisions.slice(0, 30).every((d) => d.allowed)).toBe(true)
    expect(!last.allowed && last.denial.status).toBe(429)
    expect(!last.allowed && last.denial.headers["Retry-After"]).toBe("2")
    expect(!last.allowed && last.identity?.label).toBe("anonymous")
  })

  test("while keys cannot be read, a key is answered 503 and anonymous callers are served", () => {
    const { key } = member()
    const unavailable = emptyKeyStore()

    const withKey = authorize(
      unavailable,
      emptyRateLimitState(),
      request({ apiKeyHeader: key }),
    )
    const anonymous = authorize(unavailable, emptyRateLimitState(), request())
    const reserved = authorize(
      unavailable,
      emptyRateLimitState(),
      request({ scope: "members" }),
    )

    expect(!withKey.allowed && withKey.denial.status).toBe(503)
    expect(anonymous.allowed).toBe(true)
    expect(reserved.allowed).toBe(false)
  })
})
