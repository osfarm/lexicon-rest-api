import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "lexicon_admin"
export const SESSION_LIFETIME_IN_MS = 12 * 3600 * 1000

const LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_IN_MS = 15 * 60 * 1000

export type LoginAttempts = Map<string, number[]>

export function newSessionToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Only the hash of a session token is stored: reading the database does not
 * give a way to act as an administrator.
 */
export function hashOfToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * The token a form must carry. It is derived from the session, so that a page
 * from another site, which cannot read the session cookie, cannot forge it.
 */
export function csrfTokenOf(sessionToken: string): string {
  return createHmac("sha256", sessionToken).update("csrf").digest("hex")
}

export function csrfTokenMatches(sessionToken: string, given: string | null): boolean {
  const expected = new Uint8Array(Buffer.from(csrfTokenOf(sessionToken), "hex"))
  const received = new Uint8Array(Buffer.from(given ?? "", "hex"))

  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function sessionTokenIn(cookieHeader: string | null): string | undefined {
  const cookie = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE)

  return cookie?.[1] && /^[0-9a-f]{64}$/.test(cookie[1]) ? cookie[1] : undefined
}

/**
 * The cookie is limited to the administration pages, unreadable by scripts and
 * never sent from another site. It is marked Secure whenever the visitor came
 * through HTTPS.
 */
export function sessionCookie(token: string, isSecure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_LIFETIME_IN_MS / 1000}`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; ")
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`
}

/**
 * Counts a login attempt of an address and tells whether it may still try:
 * five attempts per quarter of an hour.
 */
export function mayAttemptLogin(
  attempts: LoginAttempts,
  address: string,
  now: number,
): boolean {
  const recent = (attempts.get(address) ?? []).filter(
    (at) => now - at < LOGIN_WINDOW_IN_MS,
  )

  if (recent.length >= LOGIN_ATTEMPTS) {
    attempts.set(address, recent)

    return false
  }

  attempts.set(address, [...recent, now])

  return true
}

export function forgetLoginAttempts(attempts: LoginAttempts, address: string) {
  attempts.delete(address)
}
