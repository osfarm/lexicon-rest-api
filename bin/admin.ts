import { pool } from "../src/applyRequestConfiguration"
import { createAdmin, disableAdmin } from "../src/access/AdminStore"
import { setUpAccessSchema } from "../src/access/Schema"

// Manages the administrators of the web interface:
//   bun run bin/admin.ts create <email>     asks for the password (or reads it from standard input)
//   bun run bin/admin.ts disable <email>

const MINIMUM_PASSWORD_LENGTH = 12

const [command, email] = process.argv.slice(2)

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    return prompt("Mot de passe :") ?? ""
  }

  return (await Bun.stdin.text()).split("\n")[0]
}

async function create() {
  const password = await readPassword()

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    fail(`Le mot de passe doit faire au moins ${MINIMUM_PASSWORD_LENGTH} caractères`)
  }

  await createAdmin(
    pool,
    email,
    await Bun.password.hash(password, { algorithm: "argon2id" }),
  )
  console.log(`Administrateur ${email} enregistré`)
}

async function disable() {
  console.log(
    (await disableAdmin(pool, email))
      ? `Administrateur ${email} désactivé, ses sessions sont fermées`
      : `Aucun administrateur actif ${email}`,
  )
}

if (email === undefined || !email.includes("@")) {
  fail("Usage: bun run bin/admin.ts create|disable <email>")
}

await setUpAccessSchema(pool)

const commands: Record<string, () => Promise<void>> = { create, disable }
const run =
  commands[command] ?? (() => fail("Usage: bun run bin/admin.ts create|disable <email>"))

await run().catch((error: Error) => fail(error.message))
await pool.end()
