import type { Pool } from "pg"
import { ACCESS_SCHEMA } from "../access/Schema"

// What the assistant keeps in the database: counts per day, and two settings
// an administrator can change. Never a question, never an answer.

type Db = Pick<Pool, "query">

export type DailyCount = Readonly<{
  day: string
  questions: number
  toolCalls: number
  failures: number
  inputTokens: number
  outputTokens: number
}>

export type AssistantSettings = Readonly<{ enabled: boolean; model: string }>

const ENABLED_KEY = "assistant.enabled"
const MODEL_KEY = "assistant.model"
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/

export const isModelName = (value: string) => MODEL_NAME.test(value)

export function recordQuestion(
  db: Db,
  day: string,
  count: {
    // False for a question given back to the caller: it does not use up the day
    counted: boolean
    toolCalls: number
    failed: boolean
    inputTokens: number
    outputTokens: number
  },
): Promise<void> {
  return db
    .query(
      `INSERT INTO "${ACCESS_SCHEMA}".assistant_daily
         (day, questions, tool_calls, failures, input_tokens, output_tokens)
       VALUES ($1, $6, $2, $3, $4, $5)
       ON CONFLICT (day) DO UPDATE SET
         questions = assistant_daily.questions + EXCLUDED.questions,
         tool_calls = assistant_daily.tool_calls + EXCLUDED.tool_calls,
         failures = assistant_daily.failures + EXCLUDED.failures,
         input_tokens = assistant_daily.input_tokens + EXCLUDED.input_tokens,
         output_tokens = assistant_daily.output_tokens + EXCLUDED.output_tokens;`,
      [
        day,
        count.toolCalls,
        count.failed ? 1 : 0,
        count.inputTokens,
        count.outputTokens,
        count.counted ? 1 : 0,
      ],
    )
    .then(
      () => undefined,
      (error: Error) =>
        console.warn("Assistant usage was not recorded: " + error.message),
    )
}

export function readDailyCounts(db: Db, days: number): Promise<DailyCount[]> {
  return db
    .query(
      `SELECT day::text, questions, tool_calls, failures, input_tokens, output_tokens
         FROM "${ACCESS_SCHEMA}".assistant_daily
        WHERE day > current_date - $1::integer
        ORDER BY day DESC;`,
      [days],
    )
    .then(
      (result) =>
        result.rows.map((row) => ({
          day: row.day,
          questions: Number(row.questions),
          toolCalls: Number(row.tool_calls),
          failures: Number(row.failures),
          inputTokens: Number(row.input_tokens),
          outputTokens: Number(row.output_tokens),
        })),
      () => [],
    )
}

/**
 * The settings an administrator changed, over the defaults of the environment.
 */
export function settingsOf(
  rows: { key: string; value: string }[],
  defaults: AssistantSettings,
): AssistantSettings {
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const model = stored.get(MODEL_KEY)

  return {
    enabled: stored.has(ENABLED_KEY)
      ? stored.get(ENABLED_KEY) === "true"
      : defaults.enabled,
    model: model !== undefined && isModelName(model) ? model : defaults.model,
  }
}

export function readSettings(
  db: Db,
  defaults: AssistantSettings,
): Promise<AssistantSettings> {
  return db
    .query(
      `SELECT key, value FROM "${ACCESS_SCHEMA}".settings WHERE key LIKE 'assistant.%';`,
    )
    .then(
      (result) => settingsOf(result.rows, defaults),
      () => defaults,
    )
}

export async function writeSettings(db: Db, settings: AssistantSettings): Promise<void> {
  await db.query(
    `INSERT INTO "${ACCESS_SCHEMA}".settings (key, value, updated_at)
     VALUES ($1, $2, now()), ($3, $4, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();`,
    [ENABLED_KEY, String(settings.enabled), MODEL_KEY, settings.model],
  )
}
