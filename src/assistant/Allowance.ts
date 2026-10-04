// How many questions a caller may still ask today. Counted per caller in
// memory, as the rate limits are: no address is ever written anywhere. The
// total of the day is also kept in the database, so that a restart does not
// reopen the allowance of the whole service.

export type AllowanceLimits = Readonly<{
  anonymous: number
  key: number
  total: number
}>

export type AllowanceState = {
  day: string
  total: number
  callers: Map<string, number>
}

export type Refusal = Readonly<{ reason: "caller" | "total"; limit: number }>

export const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10)

export const emptyAllowance = (): AllowanceState => ({
  day: "",
  total: 0,
  callers: new Map(),
})

function onDay(state: AllowanceState, now: number) {
  const day = dayOf(now)

  if (state.day !== day) {
    state.day = day
    state.total = 0
    state.callers.clear()
  }
}

/**
 * Takes what the database says was already asked today, after a restart.
 */
export function restoreTotal(state: AllowanceState, total: number, now: number) {
  onDay(state, now)
  state.total = Math.max(state.total, total)
}

export function remaining(
  state: AllowanceState,
  limits: AllowanceLimits,
  caller: { id: string; hasKey: boolean },
  now: number,
): number {
  onDay(state, now)

  const own =
    (caller.hasKey ? limits.key : limits.anonymous) - (state.callers.get(caller.id) ?? 0)

  return Math.max(0, Math.min(own, limits.total - state.total))
}

/**
 * Counts one question for the caller, unless the allowance is used up.
 */
export function takeQuestion(
  state: AllowanceState,
  limits: AllowanceLimits,
  caller: { id: string; hasKey: boolean },
  now: number,
): Refusal | undefined {
  onDay(state, now)

  const limit = caller.hasKey ? limits.key : limits.anonymous
  const asked = state.callers.get(caller.id) ?? 0

  if (state.total >= limits.total) {
    return { reason: "total", limit: limits.total }
  }
  if (asked >= limit) {
    return { reason: "caller", limit }
  }

  state.callers.set(caller.id, asked + 1)
  state.total += 1

  return undefined
}

/**
 * Gives back a question that could not be answered through no fault of the caller.
 */
export function giveBackQuestion(state: AllowanceState, callerId: string, now: number) {
  if (state.day !== dayOf(now)) {
    return
  }

  state.callers.set(callerId, Math.max(0, (state.callers.get(callerId) ?? 0) - 1))
  state.total = Math.max(0, state.total - 1)
}
