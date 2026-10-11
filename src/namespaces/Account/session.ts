import { csrfTokenMatches, csrfTokenOf, type LoginAttempts } from "../../access/AdminSession"
import { memberTokenIn } from "../../access/MemberSession"
import { findSessionMember, type Member } from "../../access/MemberStore"
import type { Context } from "../../types/Context"
import { isPost, redirect } from "../Admin/session"

export const LOGIN_PATH = "/account/login"

// Attempts to log in, and requests for a link by mail, counted apart per address
export const memberLoginAttempts: LoginAttempts = new Map()
export const linkRequests: LoginAttempts = new Map()

export type MemberRequest = Readonly<{
  cxt: Context
  member: Member
  // The token of the session, to close it
  token: string
  csrf: string
  // The fields of the form, for a POST whose CSRF token was checked
  form: FormData | undefined
}>

type MemberHandler = (request: MemberRequest) => unknown | Promise<unknown>

/**
 * A page of the member area: never kept by a cache, never shown in a frame,
 * and its address, which may carry a link token, is never passed on to another site.
 */
export function page(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(body as any, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  })
}

/**
 * Wraps a page of the member area: only a logged-in member gets it, and a
 * form is only accepted with the CSRF token of the session.
 */
export function membered(handler: MemberHandler) {
  return async (cxt: Context) => {
    const token = memberTokenIn(cxt.request.headers.get("cookie"))
    const member = token === undefined ? undefined : await findSessionMember(cxt.db, token)

    if (token === undefined || member === undefined) {
      return redirect(LOGIN_PATH)
    }

    if (!["GET", "HEAD", "POST"].includes(cxt.request.method)) {
      return new Response("Method not allowed", { status: 405 })
    }

    const form = isPost(cxt) ? await cxt.request.formData() : undefined

    if (form !== undefined && !csrfTokenMatches(token, form.get("csrf") as string | null)) {
      return new Response("Formulaire expiré, rechargez la page", { status: 403 })
    }

    const result = await handler({ cxt, member, token, csrf: csrfTokenOf(token), form })

    return result instanceof Response ? result : page(result)
  }
}
