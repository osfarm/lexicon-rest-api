import { describe, expect, test } from "bun:test"
import {
  csrfTokenMatches,
  csrfTokenOf,
  forgetLoginAttempts,
  hashOfToken,
  mayAttemptLogin,
  newSessionToken,
  sessionCookie,
  sessionTokenIn,
} from "./AdminSession"

describe("sessions", () => {
  test("a token is long, random and stored only as a hash", () => {
    const token = newSessionToken()

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(newSessionToken()).not.toBe(token)
    expect(hashOfToken(token)).not.toBe(token)
    expect(hashOfToken(token)).toBe(hashOfToken(token))
  })

  test("the cookie is found among others and anything malformed is ignored", () => {
    const token = newSessionToken()

    expect(sessionTokenIn(`theme=dark; lexicon_admin=${token}; other=1`)).toBe(token)
    expect(sessionTokenIn("lexicon_admin=not-a-token")).toBeUndefined()
    expect(sessionTokenIn("theme=dark")).toBeUndefined()
    expect(sessionTokenIn(null)).toBeUndefined()
  })

  test("the cookie is scoped, hidden from scripts and same-site", () => {
    const cookie = sessionCookie("abc", true)

    expect(cookie).toContain("Path=/admin")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("Max-Age=43200")
    expect(sessionCookie("abc", false)).not.toContain("Secure")
  })
})

describe("CSRF token", () => {
  test("it belongs to one session", () => {
    const session = newSessionToken()
    const other = newSessionToken()

    expect(csrfTokenMatches(session, csrfTokenOf(session))).toBe(true)
    expect(csrfTokenMatches(session, csrfTokenOf(other))).toBe(false)
    expect(csrfTokenMatches(session, null)).toBe(false)
    expect(csrfTokenMatches(session, "zz")).toBe(false)
    expect(csrfTokenOf(session)).not.toBe(session)
  })
})

describe("login attempts", () => {
  const NOW = 1_800_000_000_000

  test("five attempts per quarter of an hour and per address", () => {
    const attempts = new Map()
    const results = [1, 2, 3, 4, 5, 6].map(() =>
      mayAttemptLogin(attempts, "203.0.113.7", NOW),
    )

    expect(results).toEqual([true, true, true, true, true, false])
    expect(mayAttemptLogin(attempts, "203.0.113.8", NOW)).toBe(true)
    expect(mayAttemptLogin(attempts, "203.0.113.7", NOW + 14 * 60 * 1000)).toBe(false)
    expect(mayAttemptLogin(attempts, "203.0.113.7", NOW + 16 * 60 * 1000)).toBe(true)
  })

  test("a successful login clears the count", () => {
    const attempts = new Map()
    ;[1, 2, 3, 4, 5].forEach(() => mayAttemptLogin(attempts, "203.0.113.7", NOW))

    forgetLoginAttempts(attempts, "203.0.113.7")

    expect(mayAttemptLogin(attempts, "203.0.113.7", NOW)).toBe(true)
  })
})
