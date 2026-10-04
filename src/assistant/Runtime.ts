import type { Pool } from "pg"
import { emptyAllowance, restoreTotal, dayOf, type AllowanceLimits } from "./Allowance"
import { readDailyCounts, readSettings, type AssistantSettings } from "./AssistantStore"
import { emptyQueue, type QueueSettings } from "./ProviderQueue"

// What the assistant keeps for the life of the process, and what the
// environment says of it.

const env = import.meta.env

const SETTINGS_LIFETIME_IN_MS = 30000

const positive = (value: string | undefined, fallback: number) => {
  const number = Number(value)

  return Number.isInteger(number) && number > 0 ? number : fallback
}

export const PROVIDER = {
  key: (env.ASSISTANT_API_KEY as string | undefined) || undefined,
  url: (
    (env.ASSISTANT_API_URL as string | undefined) || "https://api.mistral.ai/v1"
  ).replace(/\/$/, ""),
  maxTokens: 800,
  timeoutMs: 30000,
}

const DEFAULT_SETTINGS: AssistantSettings = {
  enabled: true,
  model: (env.ASSISTANT_MODEL as string | undefined) || "ministral-8b-latest",
}

export const ALLOWANCE_LIMITS: AllowanceLimits = {
  anonymous: positive(env.ASSISTANT_DAILY_ANONYMOUS, 10),
  key: positive(env.ASSISTANT_DAILY_KEY, 50),
  total: positive(env.ASSISTANT_DAILY_TOTAL, 500),
}

export const QUEUE_SETTINGS: QueueSettings = {
  minIntervalMs: positive(env.ASSISTANT_MIN_INTERVAL_MS, 400),
  maxWaiting: 8,
  retries: 2,
}

export const queue = emptyQueue()
export const allowance = emptyAllowance()

const cache: { settings: AssistantSettings; readAt: number; restoredDay: string } = {
  settings: DEFAULT_SETTINGS,
  readAt: 0,
  restoredDay: "",
}

/**
 * The settings in force: those of the environment, unless an administrator changed them.
 */
export async function currentSettings(db: Pool, now: number): Promise<AssistantSettings> {
  if (now - cache.readAt > SETTINGS_LIFETIME_IN_MS) {
    cache.settings = await readSettings(db, DEFAULT_SETTINGS)
    cache.readAt = now
  }

  return cache.settings
}

export function forgetSettings() {
  cache.readAt = 0
}

/**
 * Once a day, and after a restart, takes from the database what was already asked today.
 */
export async function restoreAllowance(db: Pool, now: number) {
  const day = dayOf(now)

  if (cache.restoredDay === day) {
    return
  }
  cache.restoredDay = day

  const today = (await readDailyCounts(db, 1)).find((count) => count.day === day)

  restoreTotal(allowance, today?.questions ?? 0, now)
}
