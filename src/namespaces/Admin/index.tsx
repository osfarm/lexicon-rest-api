import { Html } from "@elysiajs/html"
import { API } from "../../API"
import {
  expiredSessionCookie,
  forgetLoginAttempts,
  mayAttemptLogin,
  newSessionToken,
  sessionCookie,
  sessionTokenIn,
} from "../../access/AdminSession"
import {
  audit,
  auditLog,
  changeKeyPlan,
  closeSession,
  createKey,
  datasources,
  extendKey,
  findAdminToLogIn,
  findKey,
  listKeys,
  listPlans,
  openSession,
  renewKey,
  revokeKey,
  todaySummary,
  updatePlan,
  usageOf,
  type KeyRow,
} from "../../access/AdminStore"
import { ADMIN_SCOPE } from "../../access/Plan"
import type { Context } from "../../types/Context"
import { AdminLayout, e, Table } from "./AdminLayout"
import {
  addressOf,
  administered,
  isPost,
  isSecure,
  loginAttempts,
  redirect,
  type AdminRequest,
} from "./session"

const THIRTY_DAYS_IN_MS = 30 * 24 * 3600 * 1000

const DATE = /^\d{4}-\d{2}-\d{2}$/

const html = (page: unknown, headers: Record<string, string> = {}) =>
  new Response(page as any, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  })

const day = (date: Date | string | null) =>
  date === null ? "—" : new Date(date).toISOString().slice(0, 10)

const moment = (date: Date | string | null) =>
  date === null ? "—" : new Date(date).toISOString().slice(0, 16).replace("T", " ")

const text = (form: FormData | undefined, name: string) =>
  String(form?.get(name) ?? "").trim()

const scopesIn = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => /^[a-z0-9_:-]+$/.test(scope))

function stateOf(key: KeyRow, now: number): string {
  if (key.revoked_at !== null) return "révoquée"
  if (key.expires_at !== null && new Date(key.expires_at).getTime() <= now)
    return "expirée"
  if (
    key.expires_at !== null &&
    new Date(key.expires_at).getTime() - now < THIRTY_DAYS_IN_MS
  )
    return "expire bientôt"

  return "active"
}

function Hidden(props: { csrf: string; action?: string }) {
  return (
    <span>
      <input type="hidden" name="csrf" value={props.csrf} />
      {props.action ? <input type="hidden" name="action" value={props.action} /> : ""}
    </span>
  )
}

// --- login

function LoginPage(props: { error?: string }) {
  return (
    <AdminLayout title="Connexion">
      {props.error ? <p class="card error">{e(props.error)}</p> : ""}
      <form method="POST" action="/admin/login">
        <div class="field">
          <label for="email">Adresse e-mail</label>
          <br />
          <input type="email" name="email" id="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label for="password">Mot de passe</label>
          <br />
          <input
            type="password"
            name="password"
            id="password"
            required
            autocomplete="current-password"
          />
        </div>
        <button class="button" type="submit">
          Se connecter
        </button>
      </form>
    </AdminLayout>
  )
}

async function login(cxt: Context) {
  if (!isPost(cxt)) {
    return html(LoginPage({}))
  }

  const address = addressOf(cxt)
  if (!mayAttemptLogin(loginAttempts, address, Date.now())) {
    return html(
      LoginPage({ error: "Trop de tentatives. Réessayez dans un quart d'heure." }),
    )
  }

  const form = await cxt.request.formData()
  const admin = await findAdminToLogIn(cxt.db, text(form, "email"))
  // The hash is checked even for an unknown address, so that the answer takes as long either way
  const isValid = await Bun.password
    .verify(
      text(form, "password"),
      admin?.password_hash ??
        "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9yIGFuIHVua25vd24gYWRtaW4gYWNjb3VudCBvbmx5",
    )
    .catch(() => false)

  if (admin === undefined || !isValid) {
    return html(LoginPage({ error: "Adresse ou mot de passe incorrect." }))
  }

  const token = newSessionToken()
  await openSession(cxt.db, admin.id, token, Date.now())
  await audit(cxt.db, admin, "admin.login", null)
  forgetLoginAttempts(loginAttempts, address)

  return redirect("/admin", { "Set-Cookie": sessionCookie(token, isSecure(cxt)) })
}

const logout = administered(async ({ cxt, form }) => {
  const token = sessionTokenIn(cxt.request.headers.get("cookie"))

  if (form !== undefined && token !== undefined) {
    await closeSession(cxt.db, token)
  }

  return redirect("/admin/login", { "Set-Cookie": expiredSessionCookie() })
})

// --- dashboard

const dashboard = administered(async ({ cxt, admin, csrf }) => {
  const summary = await todaySummary(cxt.db)
  const served = await datasources(cxt.db)
  const stale = served?.packages.filter((item) => item.stale) ?? []
  const throttledShare =
    summary.requests === 0
      ? 0
      : Math.round((1000 * summary.throttled) / summary.requests) / 10

  return (
    <AdminLayout title="Synthèse" admin={admin} csrf={csrf}>
      <Table
        columns={["Aujourd'hui (UTC)", ""]}
        rows={[
          ["Requêtes", summary.requests],
          ["Refusées pour quota (429)", `${summary.throttled} (${throttledShare} %)`],
          ["Erreurs serveur", summary.errors],
          ["Clés actives", summary.activeKeys],
          ["Clés expirant sous 30 jours", summary.expiringKeys],
          [
            "Datasources en service",
            served === undefined ? "registre indisponible" : served.packages.length,
          ],
          [
            "Datasources périmées",
            stale.map((item) => e(item.name)).join(", ") || "aucune",
          ],
        ]}
      />
    </AdminLayout>
  )
})

// --- keys

const keys = administered(async ({ cxt, admin, csrf }) => {
  const now = Date.now()
  const all = await listKeys(cxt.db)

  return (
    <AdminLayout title="Clés d'API" admin={admin} csrf={csrf}>
      <p>
        <a class="button" href="/admin/keys/new">
          Nouvelle clé
        </a>
      </p>
      <Table
        empty="Aucune clé délivrée."
        columns={[
          "Préfixe",
          "Adhérent",
          "Plan",
          "Fin d'adhésion",
          "Dernière utilisation",
          "État",
        ]}
        rows={all.map((key) => [
          <a href={`/admin/keys/${e(key.prefix)}`}>{e(key.prefix)}</a>,
          e(key.owner_name),
          e(key.plan),
          e(key.membership_until ?? "—"),
          moment(key.last_used_at),
          stateOf(key, now),
        ])}
      />
    </AdminLayout>
  )
})

const newKey = administered(async ({ cxt, admin, csrf, form }) => {
  const plans = (await listPlans(cxt.db)).filter((plan) => plan.name !== "anonymous")
  const until = text(form, "membership_until")
  const plan = text(form, "plan")
  const isComplete =
    form !== undefined &&
    text(form, "owner_name") !== "" &&
    text(form, "owner_email").includes("@") &&
    plans.some((candidate) => candidate.name === plan) &&
    (DATE.test(until) || plan === "internal")

  if (isComplete) {
    const created = await createKey(cxt.db, admin, {
      ownerName: text(form, "owner_name"),
      ownerEmail: text(form, "owner_email"),
      plan,
      membershipUntil: DATE.test(until) ? until : null,
      extraScopes: scopesIn(text(form, "extra_scopes")),
      note: text(form, "note") || null,
    })

    return (
      <AdminLayout title="Clé créée" admin={admin} csrf={csrf}>
        <p>
          Voici la clé de <b>{e(text(form, "owner_name"))}</b>. Elle n'est affichée qu'une
          seule fois : seule son empreinte est conservée.
        </p>
        <p class="card info">
          <code style={{ fontSize: "1.2em", userSelect: "all" }}>{e(created.key)}</code>
        </p>
        <p>
          <a href={`/admin/keys/${e(created.prefix)}`}>Voir la clé</a> ·{" "}
          <a href="/admin/keys">Toutes les clés</a>
        </p>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Nouvelle clé" admin={admin} csrf={csrf}>
      {form !== undefined ? (
        <p class="card error">
          Adhérent, e-mail, plan et fin d'adhésion sont obligatoires.
        </p>
      ) : (
        ""
      )}
      <p>
        Une clé n'est délivrée qu'à un adhérent OSFarm. Elle expire avec son adhésion.
      </p>
      <form method="POST" action="/admin/keys/new">
        <Hidden csrf={csrf} />
        <div class="field">
          <label for="owner_name">Adhérent</label>
          <br />
          <input
            type="text"
            name="owner_name"
            id="owner_name"
            required
            value={e(text(form, "owner_name"))}
          />
        </div>
        <div class="field">
          <label for="owner_email">E-mail de contact</label>
          <br />
          <input
            type="email"
            name="owner_email"
            id="owner_email"
            required
            value={e(text(form, "owner_email"))}
          />
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
          Créer la clé
        </button>
      </form>
    </AdminLayout>
  )
})

const keyDetail = administered(async ({ cxt, admin, csrf, form }) => {
  const prefix = cxt.params.prefix
  const key = await findKey(cxt.db, prefix)

  if (key === undefined) {
    return new Response("Clé inconnue", { status: 404 })
  }

  const plans = (await listPlans(cxt.db)).filter((plan) => plan.name !== "anonymous")
  const action = text(form, "action")

  if (action === "revoke") {
    await revokeKey(cxt.db, admin, prefix)
  }
  if (action === "extend" && DATE.test(text(form, "membership_until"))) {
    await extendKey(cxt.db, admin, prefix, text(form, "membership_until"))
  }
  if (action === "plan" && plans.some((plan) => plan.name === text(form, "plan"))) {
    await changeKeyPlan(cxt.db, admin, prefix, text(form, "plan"))
  }
  if (action === "renew" && key.revoked_at === null) {
    const created = await renewKey(cxt.db, admin, key)

    return (
      <AdminLayout title="Clé renouvelée" admin={admin} csrf={csrf}>
        <p>
          Nouvelle clé de <b>{e(key.owner_name)}</b>, affichée une seule fois. L'ancienne
          ({e(key.prefix)}) reste valable 7 jours.
        </p>
        <p class="card info">
          <code style={{ fontSize: "1.2em", userSelect: "all" }}>{e(created.key)}</code>
        </p>
        <p>
          <a href={`/admin/keys/${e(created.prefix)}`}>Voir la nouvelle clé</a>
        </p>
      </AdminLayout>
    )
  }
  if (form !== undefined) {
    return redirect(`/admin/keys/${prefix}`)
  }

  const usage = await usageOf(cxt.db, 30, prefix)
  const isRevoked = key.revoked_at !== null

  return (
    <AdminLayout title={`Clé ${key.prefix}`} admin={admin} csrf={csrf}>
      <Table
        columns={["", ""]}
        rows={[
          ["Adhérent", e(key.owner_name)],
          ["E-mail", e(key.owner_email)],
          ["Plan", e(key.plan)],
          ["Portées supplémentaires", e(key.extra_scopes.join(", ") || "—")],
          ["Fin d'adhésion", e(key.membership_until ?? "—")],
          ["Expire le", day(key.expires_at)],
          ["Créée le", day(key.created_at)],
          ["Dernière utilisation", moment(key.last_used_at)],
          ["État", stateOf(key, Date.now())],
          ["Note", e(key.note ?? "—")],
        ]}
      />
      {isRevoked ? (
        ""
      ) : (
        <div>
          <h2>Actions</h2>
          <form method="POST">
            <Hidden csrf={csrf} action="extend" />
            <label for="membership_until">Adhésion renouvelée jusqu'au </label>
            <input type="date" name="membership_until" id="membership_until" required />
            <button class="button" type="submit">
              Prolonger
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="plan" />
            <label for="plan">Plan </label>
            <select name="plan" id="plan">
              {plans.map((plan) => (
                <option value={e(plan.name)} selected={plan.name === key.plan}>
                  {e(plan.name)}
                </option>
              ))}
            </select>
            <button class="button" type="submit">
              Changer de plan
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="renew" />
            <button class="button" type="submit">
              Renouveler (nouvelle clé, l'ancienne reste valable 7 jours)
            </button>
          </form>
          <form method="POST">
            <Hidden csrf={csrf} action="revoke" />
            <button class="button" type="submit">
              Révoquer définitivement
            </button>
          </form>
        </div>
      )}
      <h2>Consommation sur 30 jours</h2>
      <Table
        empty="Aucune requête sur la période."
        columns={["Jour", "Domaine", "Requêtes", "Refusées (429)", "Erreurs"]}
        rows={usage.map((row) => [
          e(row.day),
          e(row.namespace),
          row.requests,
          row.throttled,
          row.errors,
        ])}
      />
    </AdminLayout>
  )
})

// --- plans

const plans = administered(async ({ cxt, admin, csrf, form }) => {
  const all = await listPlans(cxt.db)
  const name = text(form, "name")
  const limit = (field: string) =>
    text(form, field) === "" ? null : parseInt(text(form, field))

  if (form !== undefined && all.some((plan) => plan.name === name)) {
    const perMinute = limit("per_minute")
    const perDay = limit("per_day")
    const isValid = [perMinute, perDay].every(
      (value) => value === null || (Number.isInteger(value) && value > 0),
    )

    if (isValid) {
      await updatePlan(cxt.db, admin, name, {
        perMinute,
        perDay,
        scopes: scopesIn(text(form, "scopes")),
      })
    }

    return redirect("/admin/plans")
  }

  return (
    <AdminLayout title="Plans" admin={admin} csrf={csrf}>
      <p>
        Un champ vide signifie « illimité ». Les changements s'appliquent en moins d'une
        minute. Le plan <code>anonymous</code> est celui des appelants sans clé.
      </p>
      <Table
        columns={["Plan", "Par minute", "Par jour", "Portées", ""]}
        rows={all.map((plan) => {
          const id = `plan-${plan.name}`

          return [
            <span>
              <form method="POST" id={e(id)}>
                <Hidden csrf={csrf} />
                <input type="hidden" name="name" value={e(plan.name)} />
              </form>
              {e(plan.name)}
            </span>,
            <input
              form={e(id)}
              type="number"
              min="1"
              name="per_minute"
              value={String(plan.per_minute ?? "")}
            />,
            <input
              form={e(id)}
              type="number"
              min="1"
              name="per_day"
              value={String(plan.per_day ?? "")}
            />,
            <input
              form={e(id)}
              type="text"
              name="scopes"
              value={e(plan.scopes.join(" "))}
            />,
            <button form={e(id)} class="button" type="submit">
              Enregistrer
            </button>,
          ]
        })}
      />
    </AdminLayout>
  )
})

// --- usage

const usage = administered(async ({ cxt, admin, csrf }) => {
  const days = Math.min(Math.max(parseInt(cxt.query.days ?? "7") || 7, 1), 90)
  const rows = await usageOf(cxt.db, days)

  if (cxt.output === "csv") {
    const lines = rows.map((row) =>
      [
        row.day,
        row.identity,
        row.namespace,
        row.requests,
        row.throttled,
        row.errors,
      ].join(","),
    )

    return new Response(
      ["day,identity,namespace,requests,throttled,errors", ...lines].join("\n") + "\n",
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lexicon-usage-${days}d.csv"`,
        },
      },
    )
  }

  const totals = new Map<string, { requests: number; throttled: number }>()
  rows.forEach((row) => {
    const total = totals.get(row.identity) ?? { requests: 0, throttled: 0 }
    totals.set(row.identity, {
      requests: total.requests + Number(row.requests),
      throttled: total.throttled + Number(row.throttled),
    })
  })
  const ranking = [...totals.entries()].sort((a, b) => b[1].requests - a[1].requests)

  return (
    <AdminLayout title="Consommation" admin={admin} csrf={csrf}>
      <p>
        Période :{" "}
        {[1, 7, 30, 90].map((count) => (
          <a href={`/admin/usage?days=${count}`}>{count} j </a>
        ))}{" "}
        · <a href={`/admin/usage.csv?days=${days}`}>Exporter en CSV</a>
      </p>
      <h2>Par clé, sur {days} jours</h2>
      <Table
        empty="Aucune requête sur la période."
        columns={["Identité", "Requêtes", "Refusées (429)"]}
        rows={ranking.map(([identity, total]) => [
          identity === "anonymous" ? (
            "anonymes"
          ) : (
            <a href={`/admin/keys/${e(identity)}`}>{e(identity)}</a>
          ),
          total.requests,
          total.throttled,
        ])}
      />
      <h2>Détail</h2>
      <Table
        empty="Aucune requête sur la période."
        columns={["Jour", "Identité", "Domaine", "Requêtes", "Refusées (429)", "Erreurs"]}
        rows={rows.map((row) => [
          e(row.day),
          e(row.identity),
          e(row.namespace),
          row.requests,
          row.throttled,
          row.errors,
        ])}
      />
    </AdminLayout>
  )
})

// --- datasources

const datasourcesPage = administered(async ({ cxt, admin, csrf }) => {
  const served = await datasources(cxt.db)

  return (
    <AdminLayout title="Datasources" admin={admin} csrf={csrf}>
      {served === undefined ? (
        <p>Cette base n'a pas de registre de packages.</p>
      ) : (
        <div>
          <p>
            Lecture seule : les chargements et retours arrière se font avec la commande
            lexicon server.
          </p>
          <h2>En service</h2>
          <Table
            columns={["Datasource", "Version", "Chargée le", "État"]}
            rows={served.packages.map((item) => [
              e(item.name),
              e(item.version),
              moment(item.loaded_at),
              item.stale ? "périmée" : "à jour",
            ])}
          />
          <h2>Derniers chargements</h2>
          <Table
            columns={["Début", "Datasource", "Version", "Remplace", "Résultat", "Détail"]}
            rows={served.loads.map((load) => [
              moment(load.started_at),
              e(load.name),
              e(load.version),
              e(load.previous ?? "—"),
              e(load.state),
              e(
                load.detail?.reasons?.join(" ; ") ??
                  (load.detail?.total_seconds ? `${load.detail.total_seconds} s` : ""),
              ),
            ])}
          />
        </div>
      )}
    </AdminLayout>
  )
})

// --- audit

const auditPage = administered(async ({ cxt, admin, csrf }) => {
  const entries = await auditLog(cxt.db)

  return (
    <AdminLayout title="Journal des actions" admin={admin} csrf={csrf}>
      <Table
        empty="Aucune action enregistrée."
        columns={["Date (UTC)", "Administrateur", "Action", "Cible", "Détail"]}
        rows={entries.map((entry) => [
          moment(entry.at),
          e(entry.email ?? "—"),
          e(entry.action),
          e(entry.target ?? "—"),
          e(JSON.stringify(entry.detail)),
        ])}
      />
    </AdminLayout>
  )
})

export const Admin = API.new()
  .restrictedTo(ADMIN_SCOPE)
  .path("/admin/login", login)
  .path("/admin/logout", logout)
  .path("/admin", dashboard)
  .path("/admin/keys", keys)
  .path("/admin/keys/new", newKey)
  .path("/admin/keys/:prefix", keyDetail)
  .path("/admin/plans", plans)
  .path("/admin/usage", usage)
  .path("/admin/datasources", datasourcesPage)
  .path("/admin/audit", auditPage)
