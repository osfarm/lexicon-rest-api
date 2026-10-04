import type { Pool } from "pg"
import { INITIAL_PLANS } from "./Plan"

export const ACCESS_SCHEMA = import.meta.env.DB_ACCESS_SCHEMA ?? "lexicon_access"

/**
 * Creates what the access control stores. Safe to run at each start: nothing
 * existing is changed, and the plans are only seeded when absent.
 */
export function setUpAccessSchema(db: Pick<Pool, "query">): Promise<void> {
  const seeds = INITIAL_PLANS.map(
    (plan) =>
      `('${plan.name}', ${plan.perMinute ?? "NULL"}, ${plan.perDay ?? "NULL"}, ${plan.maxPageSize}, ${plan.statementTimeoutMs}, '{${plan.scopes.join(",")}}')`,
  ).join(", ")

  // The schema may have been prepared for a role that cannot create schemas:
  // even with IF NOT EXISTS, Postgres would refuse the statement to that role
  const createSchema = (exists: boolean) =>
    exists ? "" : `CREATE SCHEMA IF NOT EXISTS "${ACCESS_SCHEMA}";`

  return db
    .query(`SELECT 1 FROM pg_namespace WHERE nspname = $1;`, [ACCESS_SCHEMA])
    .then((found) =>
      db.query(
        `
      ${createSchema(found.rows.length > 0)}

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".plans (
        name                 varchar PRIMARY KEY,
        per_minute           integer,
        per_day              integer,
        max_page_size        integer NOT NULL,
        statement_timeout_ms integer NOT NULL,
        scopes               text[] NOT NULL DEFAULT '{open}'
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".admins (
        id            bigserial PRIMARY KEY,
        email         varchar NOT NULL UNIQUE,
        password_hash varchar NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        disabled_at   timestamptz
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".api_keys (
        id               bigserial PRIMARY KEY,
        prefix           varchar NOT NULL UNIQUE,
        secret_hash      varchar NOT NULL,
        plan             varchar NOT NULL REFERENCES "${ACCESS_SCHEMA}".plans(name),
        owner_name       varchar NOT NULL,
        owner_email      varchar NOT NULL,
        membership_until date,
        note             text,
        extra_scopes     text[] NOT NULL DEFAULT '{}',
        created_at       timestamptz NOT NULL DEFAULT now(),
        created_by       bigint REFERENCES "${ACCESS_SCHEMA}".admins(id),
        expires_at       timestamptz,
        revoked_at       timestamptz,
        last_used_at     timestamptz
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".usage_daily (
        day       date    NOT NULL,
        identity  varchar NOT NULL,
        namespace varchar NOT NULL,
        requests  bigint  NOT NULL DEFAULT 0,
        throttled bigint  NOT NULL DEFAULT 0,
        errors    bigint  NOT NULL DEFAULT 0,
        PRIMARY KEY (day, identity, namespace)
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".sessions (
        token_hash varchar PRIMARY KEY,
        admin_id   bigint NOT NULL REFERENCES "${ACCESS_SCHEMA}".admins(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".audit_log (
        id       bigserial PRIMARY KEY,
        at       timestamptz NOT NULL DEFAULT now(),
        admin_id bigint REFERENCES "${ACCESS_SCHEMA}".admins(id),
        action   varchar NOT NULL,
        target   varchar,
        detail   jsonb
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".assistant_daily (
        day           date    PRIMARY KEY,
        questions     integer NOT NULL DEFAULT 0,
        tool_calls    integer NOT NULL DEFAULT 0,
        failures      integer NOT NULL DEFAULT 0,
        input_tokens  bigint  NOT NULL DEFAULT 0,
        output_tokens bigint  NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS "${ACCESS_SCHEMA}".settings (
        key        varchar PRIMARY KEY,
        value      varchar NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO "${ACCESS_SCHEMA}".plans
        (name, per_minute, per_day, max_page_size, statement_timeout_ms, scopes)
      VALUES ${seeds}
      ON CONFLICT (name) DO NOTHING;
      `,
      ),
    )
    .then(() => undefined)
}
