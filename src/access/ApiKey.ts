import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { Err, Ok, type Result } from "shulk"

const KEY_FORMAT = /^lex_([a-z0-9]{8})_([A-Za-z0-9]{32})$/
const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const SECRET_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export type ParsedKey = Readonly<{ prefix: string; secret: string }>

export type NewKey = Readonly<{ key: string; prefix: string; secretHash: string }>

function randomString(length: number, alphabet: string): string {
  // Bytes above the last multiple of the alphabet size are dropped: every character stays equally likely
  const limit = 256 - (256 % alphabet.length)
  const characters: string[] = []

  while (characters.length < length) {
    const usable = [...randomBytes(length * 2)].filter((byte) => byte < limit)

    characters.push(...usable.map((byte) => alphabet[byte % alphabet.length]))
  }

  return characters.slice(0, length).join("")
}

export function hashOfSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

/**
 * The key is shown once to its owner; only the prefix and the hash are stored.
 */
export function generateKey(): NewKey {
  const prefix = randomString(8, PREFIX_ALPHABET)
  const secret = randomString(32, SECRET_ALPHABET)

  return { key: `lex_${prefix}_${secret}`, prefix, secretHash: hashOfSecret(secret) }
}

export function parseKey(key: string): Result<Error, ParsedKey> {
  const parts = KEY_FORMAT.exec(key.trim())

  return parts === null
    ? Err(new Error("Malformed API key"))
    : Ok({ prefix: parts[1], secret: parts[2] })
}

export function secretMatches(secret: string, expectedHash: string): boolean {
  const given = new Uint8Array(Buffer.from(hashOfSecret(secret), "hex"))
  const expected = new Uint8Array(Buffer.from(expectedHash, "hex"))

  return given.length === expected.length && timingSafeEqual(given, expected)
}
