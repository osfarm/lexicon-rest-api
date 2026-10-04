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

  return db
    .query(
      `
      CREATE SCHEMA IF NOT EXISTS "${ACCESS_SCHEMA}";

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

      INSERT INTO "${ACCESS_SCHEMA}".plans
        (name, per_minute, per_day, max_page_size, statement_timeout_ms, scopes)
      VALUES ${seeds}
      ON CONFLICT (name) DO NOTHING;
      `,
    )
    .then(() => undefined)
}
