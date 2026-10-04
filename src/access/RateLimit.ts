import type { Plan } from "./Plan"

const ONE_MINUTE_IN_MS = 60000
const ONE_HOUR_IN_MS = 3600000

type Bucket = { tokens: number; updatedAt: number }

type DailyCount = { day: string; requests: number }

export type RateLimitState = {
  buckets: Map<string, Bucket>
  dailyCounts: Map<string, DailyCount>
}

export type RateLimitVerdict = Readonly<{
  allowed: boolean
  limit: number | null
  remaining: number | null
  // Seconds until a request is possible again, or until the bucket is full
  resetInSeconds: number
  reason?: "minute" | "day"
}>

export function emptyRateLimitState(): RateLimitState {
  return { buckets: new Map(), dailyCounts: new Map() }
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function secondsUntilNextUtcDay(now: number): number {
  const tomorrow = new Date(now)
  tomorrow.setUTCHours(24, 0, 0, 0)

  return Math.ceil((tomorrow.getTime() - now) / 1000)
}

/**
 * Takes one request out of the allowance of a caller: a token bucket for the
 * minute, a counter for the UTC day. A refused request consumes nothing.
 */
export function consume(
  state: RateLimitState,
  caller: string,
  plan: Plan,
  now: number,
): RateLimitVerdict {
  const today = utcDay(now)
  const counted = state.dailyCounts.get(caller)
  const daily = counted?.day === today ? counted : { day: today, requests: 0 }

  if (plan.perDay !== null && daily.requests >= plan.perDay) {
    return {
      allowed: false,
      limit: plan.perDay,
      remaining: 0,
      resetInSeconds: secondsUntilNextUtcDay(now),
      reason: "day",
    }
  }

  if (plan.perMinute === null) {
    state.dailyCounts.set(caller, { day: today, requests: daily.requests + 1 })

    return { allowed: true, limit: null, remaining: null, resetInSeconds: 0 }
  }

  const capacity = plan.perMinute
  const refillPerMs = capacity / ONE_MINUTE_IN_MS
  const previous = state.buckets.get(caller) ?? { tokens: capacity, updatedAt: now }
  const tokens = Math.min(
    capacity,
    previous.tokens + (now - previous.updatedAt) * refillPerMs,
  )

  if (tokens < 1) {
    state.buckets.set(caller, { tokens, updatedAt: now })

    return {
      allowed: false,
      limit: capacity,
      remaining: 0,
      resetInSeconds: Math.ceil((1 - tokens) / refillPerMs / 1000),
      reason: "minute",
    }
  }

  state.buckets.set(caller, { tokens: tokens - 1, updatedAt: now })
  state.dailyCounts.set(caller, { day: today, requests: daily.requests + 1 })

  return {
    allowed: true,
    limit: capacity,
    remaining: Math.floor(tokens - 1),
    resetInSeconds: Math.ceil((capacity - (tokens - 1)) / refillPerMs / 1000),
  }
}

/**
 * Starts the daily count of a caller from what was already recorded, so that a
 * restart of the API does not hand out a new daily allowance.
 */
export function restoreDailyCount(
  state: RateLimitState,
  caller: string,
  day: string,
  requests: number,
) {
  state.dailyCounts.set(caller, { day, requests })
}

/**
 * Forgets the callers not seen for an hour: their bucket is full again anyway.
 */
export function forgetIdleCallers(state: RateLimitState, now: number) {
  const today = utcDay(now)

  state.buckets.forEach((bucket, caller) => {
    if (now - bucket.updatedAt > ONE_HOUR_IN_MS) {
      state.buckets.delete(caller)
    }
  })
  state.dailyCounts.forEach((count, caller) => {
    if (count.day !== today) {
      state.dailyCounts.delete(caller)
    }
  })
}
