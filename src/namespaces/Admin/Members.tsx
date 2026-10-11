import { Html } from "@elysiajs/html"
import { listPlans, type Admin } from "../../access/AdminStore"
import { MAIL, mailOf, passwordLink, sendMail } from "../../access/Mailer"
import {
  changeMemberPlan,
  createMember,
  disableMember,
  enableMember,
  extendMembership,
  findMember,
  findMemberByEmail,
  issueToken,
  listMembers,
  memberKeys,
  noteInvitation,
  type Member,
} from "../../access/MemberStore"
import type { Context } from "../../types/Context"
import { AdminLayout, e, Table } from "./AdminLayout"
import { administered, redirect } from "./session"

const DATE = /^\d{4}-\d{2}-\d{2}$/

const text = (form: FormData | undefined, name: string) =>
  String(form?.get(name) ?? "").trim()

const moment = (date: Date | string | null) =>
  date === null ? "—" : new Date(date).toISOString().slice(0, 16).replace("T", " ")

const scopesIn = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => /^[a-z0-9_:-]+$/.test(scope))

function Hidden(props: { csrf: string; action?: string }) {
  return (
    <span>
      <input type="hidden" name="csrf" value={props.csrf} />
      {props.action ? <input type="hidden" name="action" value={props.action} /> : ""}
    </span>
  )
}

function stateOf(member: Member): string {
  if (member.disabled_at !== null) return "fermé"
  if (!member.has_password) return "invité, mot de passe à choisir"

  return "ouvert"
}

/**
 * The address the site is reached at, for a link shown to the administrator
 * when no mail is sent: the one their own request came through.
 */
function siteOf(cxt: Context): string {
  const url = new URL(cxt.request.url)
  const scheme = cxt.request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")

  return MAIL?.publicUrl ?? `${scheme}://${cxt.request.headers.get("host") ?? url.host}`
}

/**
 * Sends a member the link to choose their password, valid a week.
 * @returns the link, and whether it left by mail: when not, the administrator passes it on
 */
async function invite(cxt: Context, admin: Admin, member: Member) {
  const token = await issueToken(cxt.db, member.id, "invitation", Date.now())
  const link = passwordLink(siteOf(cxt), token)
  const sent = await sendMail(mailOf("invitation", member, link))

  await noteInvitation(cxt.db, admin, member, sent)

  return { link, sent }
}

function Invitation(props: { member: Member; link: string; sent: boolean }) {
  return props.sent ? (
    <p class="card info">
      Un e-mail vient d'être envoyé à <b>{e(props.member.email)}</b> : il contient le lien
      pour choisir son mot de passe, valable sept jours.
    </p>
  ) : (
    <div>
      <p class="card error">
        {MAIL === undefined
          ? "Ce site n'est pas réglé pour envoyer des e-mails (SMTP_URL, MAIL_FROM, PUBLIC_URL)."
          : "L'e-mail n'a pas pu être envoyé."}{" "}
        Transmettez vous-même ce lien à {e(props.member.email)} : il est valable sept
        jours, sert une seule fois, et n'est affiché qu'ici.
      </p>
      <p class="card info">
        <code style={{ userSelect: "all", wordBreak: "break-all" }}>{e(props.link)}</code>
      </p>
    </div>
  )
}

export const members = administered(async ({ cxt, admin, csrf }) => {
  const all = await listMembers(cxt.db)

  return (
    <AdminLayout title="Adhérents" admin={admin} csrf={csrf}>
      <p>
        Un adhérent crée, limite et révoque lui-même ses clés dans son{" "}
        <a href="/account">espace adhérent</a>. Son compte s'ouvre ici ; il est prévenu par
        e-mail.
      </p>
      <p>
        <a class="button" href="/admin/members/new">
          Nouvel adhérent
        </a>
      </p>
      <Table
        empty="Aucun compte adhérent."
        columns={[
          "Adhérent",
          "E-mail",
          "Plan",
          "Fin d'adhésion",
          "Clés actives",
          "Dernière connexion",
          "Compte",
        ]}
        rows={all.map((member) => [
          <a href={`/admin/members/${e(member.id)}`}>{e(member.name)}</a>,
          e(member.email),
          e(member.plan),
          e(member.membership_until ?? "—"),
          member.active_keys,
          moment(member.last_login_at),
          stateOf(member),
        ])}
      />
    </AdminLayout>
  )
})

export const newMember = administered(async ({ cxt, admin, csrf, form }) => {
  const plans = (await listPlans(cxt.db)).filter((plan) => plan.name !== "anonymous")
  const until = text(form, "membership_until")
  const plan = text(form, "plan")
  const email = text(form, "email")
  const isComplete =
    form !== undefined &&
    text(form, "name") !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    plans.some((candidate) => candidate.name === plan) &&
    (DATE.test(until) || plan === "internal")
  const existing = isComplete ? await findMemberByEmail(cxt.db, email) : undefined

  if (isComplete && existing === undefined) {
    const created = await createMember(cxt.db, admin, {
      name: text(form, "name"),
      email,
      plan,
      membershipUntil: DATE.test(until) ? until : null,
      extraScopes: scopesIn(text(form, "extra_scopes")),
      note: text(form, "note") || null,
    })

    if (created !== undefined) {
      const invitation = await invite(cxt, admin, created)

      return (
        <AdminLayout title="Compte ouvert" admin={admin} csrf={csrf}>
          <p>
            Le compte de <b>{e(created.name)}</b> est ouvert.
          </p>
          <Invitation member={created} link={invitation.link} sent={invitation.sent} />
          <p>
            <a href={`/admin/members/${e(created.id)}`}>Voir le compte</a> ·{" "}
            <a href="/admin/members">Tous les adhérents</a>
          </p>
        </AdminLayout>
      )
    }
  }

  return (
    <AdminLayout title="Nouvel adhérent" admin={admin} csrf={csrf}>
      {form === undefined ? (
        ""
      ) : (
        <p class="card error">
          {existing !== undefined
            ? "Cette adresse a déjà un compte adhérent."
            : "Nom, e-mail, plan et fin d'adhésion sont obligatoires."}
        </p>
      )}
      <p>
        L'adhérent reçoit un e-mail avec un lien pour choisir son mot de passe. Ses clés
        prennent le plan et la fin d'adhésion du compte ; celles déjà délivrées à la même
        adresse lui sont rattachées.
      </p>
      <form method="POST" action="/admin/members/new">
        <Hidden csrf={csrf} />
        <div class="field">
          <label for="name">Adhérent</label>
          <br />
          <input type="text" name="name" id="name" required value={e(text(form, "name"))} />
        </div>
        <div class="field">
          <label for="email">E-mail (son identifiant)</label>
          <br />
          <input type="email" name="email" id="email" required value={e(email)} />
        </div>
        <div class="field">
          <label for="membership_until">Fin d'adhésion</label>
          <br />
          <input
            type="date"
            name="membership_until"
            id="membership_until"
            value={e(until)}
          />
        </div>
        <div class="field">
          <label for="plan">Plan</label>
          <br />
          <select name="plan" id="plan">
            {plans.map((candidate) => (
              <option
                value={e(candidate.name)}
                selected={candidate.name === (plan || "standard")}
              >
                {e(candidate.name)}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="extra_scopes">Portées supplémentaires (ex. bundle:cultia)</label>
          <br />
          <input
            type="text"
            name="extra_scopes"
            id="extra_scopes"
            value={e(text(form, "extra_scopes"))}
          />
        </div>
        <div class="field">
          <label for="note">Note</label>
          <br />
          <input type="text" name="note" id="note" value={e(text(form, "note"))} />
        </div>
        <button class="button" type="submit">
          Ouvrir le compte et prévenir l'adhérent
        </button>
      </form>
    </AdminLayout>
  )
})

export const memberDetail = administered(async ({ cxt, admin, csrf, form }) => {
  const member = await findMember(cxt.db, cxt.params.id)

  if (member === undefined) {
    return new Response("Adhérent inconnu", { status: 404 })
  }

  const plans = (await listPlans(cxt.db)).filter((plan) => plan.name !== "anonymous")
  const action = text(form, "action")
  const isOpen = member.disabled_at === null

  if (action === "invite" && isOpen) {
    const invitation = await invite(cxt, admin, member)

    return (
      <AdminLayout title="Lien envoyé" admin={admin} csrf={csrf}>
        <Invitation member={member} link={invitation.link} sent={invitation.sent} />
        <p>
          <a href={`/admin/members/${e(member.id)}`}>Retour au compte</a>
        </p>
      </AdminLayout>
    )
  }
  if (action === "extend" && DATE.test(text(form, "membership_until"))) {
    await extendMembership(cxt.db, admin, member, text(form, "membership_until"))
  }
  if (action === "plan" && plans.some((plan) => plan.name === text(form, "plan"))) {
    await changeMemberPlan(cxt.db, admin, member, text(form, "plan"))
  }
  if (action === "disable" && isOpen) {
    await disableMember(cxt.db, admin, member)
  }
  if (action === "enable" && !isOpen) {
    await enableMember(cxt.db, admin, member)
  }
  if (form !== undefined) {
    return redirect(`/admin/members/${member.id}`)
  }

  const keys = await memberKeys(cxt.db, member.id)
  const now = Date.now()

  return (
    <AdminLayout title={member.name} admin={admin} csrf={csrf}>
      <Table
        columns={["", ""]}
        rows={[
          ["E-mail", e(member.email)],
          ["Plan", e(member.plan)],
          ["Portées supplémentaires", e(member.extra_scopes.join(", ") || "—")],
          ["Fin d'adhésion", e(member.membership_until ?? "—")],
          ["Compte", stateOf(member)],
          ["Ouvert le", moment(member.created_at)],
          ["Dernière connexion", moment(member.last_login_at)],
          ["Note", e(member.note ?? "—")],
        ]}
      />
      <h2>Ses clés</h2>
      <Table
        empty="Aucune clé."
        columns={["Préfixe", "Usage", "Utilisable depuis", "Dernière utilisation", "État"]}
        rows={keys.map((key) => [
          <a href={`/admin/keys/${e(key.prefix)}`}>{e(key.prefix)}</a>,
          e(key.label ?? "—"),
          e([...key.allowed_addresses, ...key.allowed_domains].join(", ") || "partout"),
          moment(key.last_used_at),
          key.revoked_at !== null
            ? "révoquée"
            : key.expires_at !== null && new Date(key.expires_at).getTime() <= now
              ? "expirée"
              : "active",
        ])}
      />
      <h2>Actions</h2>
      {isOpen ? (
        <div>
          <form method="POST">
            <Hidden csrf={csrf} action="invite" />
            <button class="button" type="submit">
              {member.has_password
                ? "Envoyer un lien pour choisir un nouveau mot de passe"
                : "Renvoyer l'invitation"}
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="extend" />
            <label for="membership_until">Adhésion renouvelée jusqu'au </label>
            <input type="date" name="membership_until" id="membership_until" required />
            <button class="button" type="submit">
              Prolonger (ses clés suivent)
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="plan" />
            <label for="plan">Plan </label>
            <select name="plan" id="plan">
              {plans.map((plan) => (
                <option value={e(plan.name)} selected={plan.name === member.plan}>
                  {e(plan.name)}
                </option>
              ))}
            </select>
            <button class="button" type="submit">
              Changer de plan (ses clés suivent)
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="disable" />
            <button class="button" type="submit">
              Fermer le compte et révoquer ses clés
            </button>
          </form>
        </div>
      ) : (
        <form method="POST">
          <Hidden csrf={csrf} action="enable" />
          <button class="button" type="submit">
            Rouvrir le compte (les clés révoquées le restent)
          </button>
        </form>
      )}
    </AdminLayout>
  )
})
