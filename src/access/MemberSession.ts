import { randomBytes } from "node:crypto"

export const MEMBER_COOKIE = "lexicon_member"
export const MEMBER_SESSION_LIFETIME_IN_MS = 12 * 3600 * 1000
export const MINIMUM_PASSWORD_LENGTH = 12
export const MAXIMUM_PASSWORD_LENGTH = 200

// An invitation waits for a member to read their mail; a forgotten password is asked for on the spot
export const INVITATION_LIFETIME_IN_MS = 7 * 24 * 3600 * 1000
export const RESET_LIFETIME_IN_MS = 3600 * 1000

export type TokenPurpose = "invitation" | "reset"

const TOKEN_FORMAT = /^[0-9a-f]{64}$/

export function lifetimeOf(purpose: TokenPurpose): number {
  return purpose === "invitation" ? INVITATION_LIFETIME_IN_MS : RESET_LIFETIME_IN_MS
}

/**
 * What a link sent by e-mail carries. Only its hash is stored, as for a session.
 */
export function newMemberToken(): string {
  return randomBytes(32).toString("hex")
}

export function isToken(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_FORMAT.test(value)
}

export function memberTokenIn(cookieHeader: string | null): string | undefined {
  const cookie = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === MEMBER_COOKIE)

  return isToken(cookie?.[1]) ? cookie[1] : undefined
}

/**
 * The cookie is limited to the member area, unreadable by scripts and never
 * sent from another site.
 */
export function memberCookie(token: string, isSecure: boolean): string {
  return [
    `${MEMBER_COOKIE}=${token}`,
    "Path=/account",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${MEMBER_SESSION_LIFETIME_IN_MS / 1000}`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; ")
}

export function expiredMemberCookie(): string {
  return `${MEMBER_COOKIE}=; Path=/account; HttpOnly; SameSite=Strict; Max-Age=0`
}

/**
 * @returns what is wrong with a password a member chose, undefined when it is acceptable
 */
export function passwordProblem(password: string, confirmation: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MINIMUM_PASSWORD_LENGTH} caractères.`
  }
  if (password.length > MAXIMUM_PASSWORD_LENGTH) {
    return `Le mot de passe ne peut pas dépasser ${MAXIMUM_PASSWORD_LENGTH} caractères.`
  }
  if (password !== confirmation) {
    return "Les deux saisies du mot de passe diffèrent."
  }

  return undefined
}
