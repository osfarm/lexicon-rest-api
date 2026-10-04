import { describe, expect, test } from "bun:test"
import type { Plan } from "./Plan"
import {
  consume,
  emptyRateLimitState,
  forgetIdleCallers,
  restoreDailyCount,
} from "./RateLimit"

const NOON = Date.UTC(2026, 9, 4, 12, 0, 0)

const plan = (limits: Partial<Plan>): Plan => ({
  name: "test",
  perMinute: 3,
  perDay: 100,
  maxPageSize: 150,
  statementTimeoutMs: 5000,
  scopes: ["open"],
  ...limits,
})

describe("consume", () => {
  test("a caller can burst up to the limit per minute, then is refused", () => {
    const state = emptyRateLimitState()
    const verdicts = [1, 2, 3, 4].map(() => consume(state, "ip:1", plan({}), NOON))

    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, false])
    expect(verdicts.map((v) => v.remaining)).toEqual([2, 1, 0, 0])
    expect(verdicts[3].reason).toBe("minute")
    expect(verdicts[3].resetInSeconds).toBe(20)
  })

  test("the allowance comes back with time", () => {
    const state = emptyRateLimitState()
    ;[1, 2, 3].forEach(() => consume(state, "ip:1", plan({}), NOON))

    expect(consume(state, "ip:1", plan({}), NOON + 10000).allowed).toBe(false)
    expect(consume(state, "ip:1", plan({}), NOON + 20000).allowed).toBe(true)
    expect(consume(state, "ip:1", plan({}), NOON + 21000).allowed).toBe(false)
  })

  test("callers do not share their allowance", () => {
    const state = emptyRateLimitState()
    ;[1, 2, 3].forEach(() => consume(state, "ip:1", plan({}), NOON))

    expect(consume(state, "ip:1", plan({}), NOON).allowed).toBe(false)
    expect(consume(state, "ip:2", plan({}), NOON).allowed).toBe(true)
  })

  test("the daily allowance is refused until the next UTC day", () => {
    const state = emptyRateLimitState()
    const daily = plan({ perMinute: null, perDay: 2 })

    expect(consume(state, "key:a", daily, NOON).allowed).toBe(true)
    expect(consume(state, "key:a", daily, NOON).allowed).toBe(true)

    const refused = consume(state, "key:a", daily, NOON)
    expect(refused.allowed).toBe(false)
    expect(refused.reason).toBe("day")
    expect(refused.resetInSeconds).toBe(12 * 3600)

    expect(consume(state, "key:a", daily, NOON + 12 * 3600 * 1000).allowed).toBe(true)
  })

  test("a refused request does not count against the day", () => {
    const state = emptyRateLimitState()
    const tight = plan({ perMinute: 1, perDay: 2 })

    consume(state, "ip:1", tight, NOON)
    consume(state, "ip:1", tight, NOON)
    consume(state, "ip:1", tight, NOON)

    expect(consume(state, "ip:1", tight, NOON + 60000).allowed).toBe(true)
    expect(consume(state, "ip:1", tight, NOON + 120000).reason).toBe("day")
  })

  test("an unlimited plan is never refused and reports no limit", () => {
    const state = emptyRateLimitState()
    const unlimited = plan({ perMinute: null, perDay: null })
    const verdicts = Array.from({ length: 500 }, () =>
      consume(state, "key:a", unlimited, NOON),
    )

    expect(verdicts.every((v) => v.allowed)).toBe(true)
    expect(verdicts[0].limit).toBeNull()
  })

  test("what was already used today survives a restart", () => {
    const state = emptyRateLimitState()
    restoreDailyCount(state, "key:a", "2026-10-04", 99)
    const daily = plan({ perMinute: null, perDay: 100 })

    expect(consume(state, "key:a", daily, NOON).allowed).toBe(true)
    expect(consume(state, "key:a", daily, NOON).allowed).toBe(false)
  })
})

describe("forgetIdleCallers", () => {
  test("idle buckets and counts of past days are dropped", () => {
    const state = emptyRateLimitState()
    consume(state, "ip:old", plan({}), NOON - 2 * 3600 * 1000)
    consume(state, "ip:yesterday", plan({}), NOON - 13 * 3600 * 1000)
    consume(state, "ip:recent", plan({}), NOON)

    forgetIdleCallers(state, NOON)

    expect([...state.buckets.keys()]).toEqual(["ip:recent"])
    expect([...state.dailyCounts.keys()].sort()).toEqual(["ip:old", "ip:recent"])
  })
})
