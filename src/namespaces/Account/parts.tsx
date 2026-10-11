import { Html } from "@elysiajs/html"
import { AdminLayout, type Area } from "../Admin/AdminLayout"
import type { MemberRequest } from "./session"

const AREA: Area = {
  home: "/account",
  name: "espace adhérent",
  logout: "/account/logout",
  sections: [
    ["/account", "Mes clés"],
    ["/account/collections", "Mes collectes"],
    ["/account/password", "Mot de passe"],
    ["/documentation", "Documentation"],
  ],
}

export const text = (form: FormData | undefined, name: string) =>
  String(form?.get(name) ?? "").trim()

export function Layout(props: { title: string; request?: MemberRequest; children?: any }) {
  return (
    <AdminLayout
      title={props.title}
      area={AREA}
      admin={props.request ? { email: props.request.member.email } : undefined}
      csrf={props.request?.csrf}
    >
      {props.children}
    </AdminLayout>
  )
}

export function Hidden(props: { csrf: string; action?: string }) {
  return (
    <span>
      <input type="hidden" name="csrf" value={props.csrf} />
      {props.action ? <input type="hidden" name="action" value={props.action} /> : ""}
    </span>
  )
}

