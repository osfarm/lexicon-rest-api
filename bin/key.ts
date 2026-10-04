import { pool } from "../src/applyRequestConfiguration"
import { generateKey } from "../src/access/ApiKey"
import { ACCESS_SCHEMA, setUpAccessSchema } from "../src/access/Schema"

// Manages API keys from the command line:
//   bun run bin/key.ts create --owner "Member name" --email a@b.org --plan standard --until 2027-01-31 [--scope bundle:cultia] [--note "..."]
//   bun run bin/key.ts list
//   bun run bin/key.ts revoke <prefix>

const [command, ...rest] = process.argv.slice(2)

function option(name: string): string | undefined {
  const index = rest.indexOf(`--${name}`)

  return index === -1 ? undefined : rest[index + 1]
}

function options(name: string): string[] {
  return rest.flatMap((value, index) => (value === `--${name}` ? [rest[index + 1]] : []))
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function create() {
  const owner =
    option("owner") ?? fail("--owner is required: the OSFarm member the key is for")
  const email = option("email") ?? fail("--email is required")
  const plan = option("plan") ?? "standard"
  const until = option("until")

  if (until === undefined && plan !== "internal") {
    fail("--until is required: the end of the membership (YYYY-MM-DD)")
  }

  const key = generateKey()
  await pool.query(
    `INSERT INTO "${ACCESS_SCHEMA}".api_keys
       (prefix, secret_hash, plan, owner_name, owner_email, membership_until, expires_at, extra_scopes, note)
     VALUES ($1, $2, $3, $4, $5, $6::date, ($6::date + 1)::timestamptz, $7, $8);`,
    [
      key.prefix,
      key.secretHash,
      plan,
      owner,
      email,
      until ?? null,
      options("scope"),
      option("note") ?? null,
    ],
  )

  console.log(`Key for ${owner} (plan ${plan}${until ? `, valid until ${until}` : ""}):`)
  console.log("")
  console.log(`  ${key.key}`)
  console.log("")
  console.log("It is shown only once: only its hash is stored.")
}

async function list() {
  const keys = await pool.query(
    `SELECT prefix, owner_name, plan, membership_until::text, last_used_at, revoked_at, extra_scopes
       FROM "${ACCESS_SCHEMA}".api_keys ORDER BY created_at;`,
  )

  keys.rows.forEach((row) =>
    console.log(
      [
        row.prefix,
        row.plan.padEnd(9),
        (row.membership_until ?? "-").padEnd(10),
        row.revoked_at ? "revoked" : "active ",
        row.owner_name,
        row.extra_scopes.join(","),
      ].join("  "),
    ),
  )
}

async function revoke() {
  const prefix = rest[0] ?? fail("Which key? Give its prefix")
  const result = await pool.query(
    `UPDATE "${ACCESS_SCHEMA}".api_keys SET revoked_at = now() WHERE prefix = $1 AND revoked_at IS NULL;`,
    [prefix],
  )

  console.log(result.rowCount === 1 ? `Key ${prefix} revoked` : `No active key ${prefix}`)
}

await setUpAccessSchema(pool)

const commands: Record<string, () => Promise<void>> = { create, list, revoke }
const run =
  commands[command ?? ""] ?? (() => fail("Usage: bun run bin/key.ts create|list|revoke"))

await run().catch((error: Error) => fail(error.message))
await pool.end()
