import type { Context } from "../../types/Context"
import {
  csrfTokenMatches,
  csrfTokenOf,
  sessionTokenIn,
  type LoginAttempts,
} from "../../access/AdminSession"
import { findSessionAdmin, type Admin } from "../../access/AdminStore"
import { callerAddress } from "../../access/CallerAddress"

const TRUSTED_PROXIES = parseInt(import.meta.env.TRUSTED_PROXIES ?? "1")

export const loginAttempts: LoginAttempts = new Map()

export type AdminRequest = Readonly<{
  cxt: Context
  admin: Admin
  csrf: string
  // The fields of the form, for a POST whose CSRF token was checked
  form: FormData | undefined
}>

type AdminHandler = (request: AdminRequest) => unknown | Promise<unknown>

export function redirect(location: string, headers: Record<string, string> = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...headers } })
}

export function isPost(cxt: Context) {
  return cxt.request.method === "POST"
}

export function isSecure(cxt: Context) {
  return cxt.request.headers.get("x-forwarded-proto") === "https"
}

export function addressOf(cxt: Context) {
  return callerAddress(
    cxt.request.headers.get("x-forwarded-for"),
    undefined,
    TRUSTED_PROXIES,
  )
}

/**
 * Wraps a page of the administration: only a logged-in administrator gets it,
 * and a form is only accepted with the CSRF token of the session.
 */
export function administered(handler: AdminHandler) {
  return async (cxt: Context) => {
    const token = sessionTokenIn(cxt.request.headers.get("cookie"))
    const admin = token === undefined ? undefined : await findSessionAdmin(cxt.db, token)

    if (token === undefined || admin === undefined) {
      return redirect("/admin/login")
    }

    if (!["GET", "HEAD", "POST"].includes(cxt.request.method)) {
      return new Response("Method not allowed", { status: 405 })
    }

    const form = isPost(cxt) ? await cxt.request.formData() : undefined

    if (
      form !== undefined &&
      !csrfTokenMatches(token, form.get("csrf") as string | null)
    ) {
      return new Response("Formulaire expiré, rechargez la page", { status: 403 })
    }

    const result = await handler({ cxt, admin, csrf: csrfTokenOf(token), form })

    return result instanceof Response
      ? result
      : new Response(result as any, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
          },
        })
  }
}
