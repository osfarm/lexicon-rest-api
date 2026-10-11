import { Html } from "@elysiajs/html"
import { API } from "../../API"
import { forgetLoginAttempts, mayAttemptLogin } from "../../access/AdminSession"
import { MAIL, mailOf, passwordLink, sendMail } from "../../access/Mailer"
import {
  expiredMemberCookie,
  isToken,
  memberCookie,
  MINIMUM_PASSWORD_LENGTH,
  newMemberToken,
  passwordProblem,
} from "../../access/MemberSession"
import {
  changePassword,
  choosePassword,
  closeMemberSession,
  createMemberKey,
  describeMemberKey,
  findMemberByEmail,
  findMemberKey,
  findMemberToLogIn,
  findTokenMember,
  issueToken,
  MAXIMUM_ACTIVE_KEYS,
  MAXIMUM_LABEL_LENGTH,
  memberKeys,
  membershipRuns,
  openMemberSession,
  passwordHashOf,
  REPLACEMENT_OVERLAP_IN_DAYS,
  replaceMemberKey,
  revokeMemberKey,
  type MemberKey,
} from "../../access/MemberStore"
import { ACCOUNT_SCOPE } from "../../access/Plan"
import { MAXIMUM_ENTRIES, restrictionsIn } from "../../access/Restriction"
import { usageOf } from "../../access/AdminStore"
import type { Context } from "../../types/Context"
import { e, Table } from "../Admin/AdminLayout"
import {
  collectionData,
  collectionDetail,
  collectionExport,
  collectionSession,
  collections,
  newCollection,
} from "./Collections"
import { Hidden, Layout, text } from "./parts"
import { addressOf, isPost, isSecure, redirect } from "../Admin/session"
import {
  linkRequests,
  LOGIN_PATH,
  membered,
  memberLoginAttempts,
  page,
  type MemberRequest,
} from "./session"

const THIRTY_DAYS_IN_MS = 30 * 24 * 3600 * 1000
// Checked for an address without an account too, so that the answer takes as long either way
const UNKNOWN_ACCOUNT_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9yIGFuIHVua25vd24gYWRtaW4gYWNjb3VudCBvbmx5"

const today = () => new Date().toISOString().slice(0, 10)

const moment = (date: Date | string | null) =>
  date === null ? "jamais" : new Date(date).toISOString().slice(0, 16).replace("T", " ")

const day = (date: Date | string | null) =>
  date === null ? "—" : new Date(date).toISOString().slice(0, 10)

function stateOf(key: MemberKey, now: number): string {
  if (key.revoked_at !== null) return "révoquée"
  if (key.expires_at !== null && new Date(key.expires_at).getTime() <= now)
    return "expirée"
  if (
    key.expires_at !== null &&
    new Date(key.expires_at).getTime() - now < THIRTY_DAYS_IN_MS
  )
    return `expire le ${day(key.expires_at)}`

  return "active"
}

const isUsable = (key: MemberKey, now: number) =>
  key.revoked_at === null &&
  (key.expires_at === null || new Date(key.expires_at).getTime() > now)

function perimeterOf(key: MemberKey): string {
  const entries = [...key.allowed_addresses, ...key.allowed_domains]

  return entries.length === 0 ? "partout" : entries.join(", ")
}

// --- logging in

function LoginPage(props: { error?: string; notice?: string }) {
  return (
    <Layout title="Espace adhérent">
      {props.error ? <p class="card error">{e(props.error)}</p> : ""}
      {props.notice ? <p class="card info">{e(props.notice)}</p> : ""}
      <p>
        Les adhérents d'OSFarm créent ici leurs clés d'API, les limitent aux adresses ou
        aux sites qui s'en servent, et les révoquent.
      </p>
      <form method="POST" action={LOGIN_PATH}>
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
      <p>
        <a href="/account/forgot">Mot de passe oublié, ou jamais choisi</a>
      </p>
      <p>
        Pas encore de compte ? Il est ouvert par OSFarm à ses adhérents :{" "}
        <a href="https://www.osfarm.org/">osfarm.org</a>.
      </p>
    </Layout>
  )
}

async function login(cxt: Context) {
  if (!isPost(cxt)) {
    return page(LoginPage({}))
  }

  const address = addressOf(cxt)
  if (!mayAttemptLogin(memberLoginAttempts, address, Date.now())) {
    return page(
      LoginPage({ error: "Trop de tentatives. Réessayez dans un quart d'heure." }),
      {},
      429,
    )
  }

  const form = await cxt.request.formData()
  const member = await findMemberToLogIn(cxt.db, text(form, "email"))
  const isValid = await Bun.password
    .verify(text(form, "password"), member?.password_hash ?? UNKNOWN_ACCOUNT_HASH)
    .catch(() => false)

  if (member === undefined || !isValid) {
    return page(LoginPage({ error: "Adresse ou mot de passe incorrect." }), {}, 401)
  }

  const token = newMemberToken()
  await openMemberSession(cxt.db, member.id, token, Date.now())
  forgetLoginAttempts(memberLoginAttempts, address)

  return redirect("/account", { "Set-Cookie": memberCookie(token, isSecure(cxt)) })
}

const logout = membered(async ({ cxt, token, form }) => {
  if (form !== undefined) {
    await closeMemberSession(cxt.db, token)
  }

  return redirect(LOGIN_PATH, { "Set-Cookie": expiredMemberCookie() })
})

// --- choosing a password

function ForgotPage(props: { sent?: boolean; error?: string }) {
  return (
    <Layout title="Recevoir un lien par e-mail">
      {props.error ? <p class="card error">{e(props.error)}</p> : ""}
      {props.sent ? (
        <p class="card info">
          Si cette adresse est celle d'un compte adhérent, un lien vient de lui être
          envoyé. Il est valable une heure.
        </p>
      ) : (
        ""
      )}
      {MAIL === undefined ? (
        <p>
          Ce site n'envoie pas d'e-mail. Demandez un nouveau lien à OSFarm :{" "}
          <a href="https://www.osfarm.org/">osfarm.org</a>.
        </p>
      ) : (
        <form method="POST" action="/account/forgot">
          <p>
            Indiquez l'adresse de votre compte : vous recevrez un lien pour choisir votre
            mot de passe.
          </p>
          <div class="field">
            <label for="email">Adresse e-mail</label>
            <br />
            <input type="email" name="email" id="email" required autocomplete="username" />
          </div>
          <button class="button" type="submit">
            Recevoir le lien
          </button>
        </form>
      )}
      <p>
        <a href={LOGIN_PATH}>Retour à la connexion</a>
      </p>
    </Layout>
  )
}

async function forgot(cxt: Context) {
  if (!isPost(cxt) || MAIL === undefined) {
    return page(ForgotPage({}))
  }

  if (!mayAttemptLogin(linkRequests, addressOf(cxt), Date.now())) {
    return page(
      ForgotPage({ error: "Trop de demandes. Réessayez dans un quart d'heure." }),
      {},
      429,
    )
  }

  const member = await findMemberByEmail(
    cxt.db,
    text(await cxt.request.formData(), "email"),
  )

  const { publicUrl } = MAIL

  // Nothing waits for the mail to leave: the answer says the same, as fast, whether the account exists or not
  if (member !== undefined && member.disabled_at === null) {
    issueToken(cxt.db, member.id, "reset", Date.now())
      .then((token) => sendMail(mailOf("reset", member, passwordLink(publicUrl, token))))
      .catch((error: Error) => console.warn("Reset link not sent: " + error.message))
  }

  return page(ForgotPage({ sent: true }))
}

function PasswordFields() {
  return (
    <div>
      <div class="field">
        <label for="password">
          Nouveau mot de passe ({MINIMUM_PASSWORD_LENGTH} caractères au moins)
        </label>
        <br />
        <input
          type="password"
          name="password"
          id="password"
          required
          minlength={String(MINIMUM_PASSWORD_LENGTH)}
          autocomplete="new-password"
        />
      </div>
      <div class="field">
        <label for="confirmation">Le même, une seconde fois</label>
        <br />
        <input
          type="password"
          name="confirmation"
          id="confirmation"
          required
          autocomplete="new-password"
        />
      </div>
    </div>
  )
}

/**
 * The page a link sent by e-mail opens: the member chooses their password,
 * and is logged in.
 */
async function passwordFromLink(cxt: Context, token: string) {
  const form = isPost(cxt) ? await cxt.request.formData() : undefined
  const member = await findTokenMember(cxt.db, token)

  if (member === undefined) {
    return page(
      <Layout title="Lien expiré">
        <p class="card error">
          Ce lien n'est plus valable : il a déjà servi, ou il a expiré.
        </p>
        <p>
          <a href="/account/forgot">Recevoir un nouveau lien</a>
        </p>
      </Layout>,
      {},
      410,
    )
  }

  const problem =
    form === undefined
      ? undefined
      : passwordProblem(
          String(form.get("password") ?? ""),
          String(form.get("confirmation") ?? ""),
        )

  if (form !== undefined && problem === undefined) {
    const chosen = await choosePassword(
      cxt.db,
      token,
      await Bun.password.hash(String(form.get("password")), { algorithm: "argon2id" }),
    )

    if (chosen !== undefined) {
      const session = newMemberToken()
      await openMemberSession(cxt.db, chosen.id, session, Date.now())

      return redirect("/account", { "Set-Cookie": memberCookie(session, isSecure(cxt)) })
    }

    return redirect("/account/password?token=" + token)
  }

  return page(
    <Layout title="Choisir mon mot de passe">
      {problem ? <p class="card error">{e(problem)}</p> : ""}
      <p>
        Compte de <b>{e(member.name)}</b>, identifiant <b>{e(member.email)}</b>.
      </p>
      <form method="POST" action="/account/password">
        <input type="hidden" name="token" value={token} />
        <PasswordFields />
        <button class="button" type="submit">
          Enregistrer et ouvrir mon espace
        </button>
      </form>
    </Layout>,
  )
}

const changeOwnPassword = membered(async (request) => {
  const { cxt, member, csrf, form } = request
  const current = String(form?.get("current") ?? "")
  const isCurrent =
    form !== undefined &&
    (await Bun.password
      .verify(current, (await passwordHashOf(cxt.db, member)) ?? UNKNOWN_ACCOUNT_HASH)
      .catch(() => false))
  const problem =
    form === undefined
      ? undefined
      : !isCurrent
        ? "Le mot de passe actuel n'est pas le bon."
        : passwordProblem(
            String(form.get("password") ?? ""),
            String(form.get("confirmation") ?? ""),
          )

  if (form !== undefined && problem === undefined) {
    await changePassword(
      cxt.db,
      member,
      await Bun.password.hash(String(form.get("password")), { algorithm: "argon2id" }),
    )

    // Every session was closed with the former password: this one starts again
    const session = newMemberToken()
    await openMemberSession(cxt.db, member.id, session, Date.now())

    return redirect("/account?password=changed", {
      "Set-Cookie": memberCookie(session, isSecure(cxt)),
    })
  }

  return (
    <Layout title="Mot de passe" request={request}>
      {problem ? <p class="card error">{e(problem)}</p> : ""}
      <form method="POST" action="/account/password">
        <Hidden csrf={csrf} />
        <div class="field">
          <label for="current">Mot de passe actuel</label>
          <br />
          <input
            type="password"
            name="current"
            id="current"
            required
            autocomplete="current-password"
          />
        </div>
        <PasswordFields />
        <button class="button" type="submit">
          Changer de mot de passe
        </button>
      </form>
      <p>Les autres sessions ouvertes avec l'ancien mot de passe seront fermées.</p>
    </Layout>
  )
})

/**
 * With the token of a link, the page that chooses a password; otherwise the
 * page where a logged-in member changes theirs.
 */
async function password(cxt: Context) {
  // The request is read once: the token of a link travels in the address, then in the form
  const posted = isPost(cxt) ? await cxt.request.clone().formData() : undefined
  const token = cxt.query.token ?? posted?.get("token")

  return isToken(typeof token === "string" ? token : null)
    ? passwordFromLink(cxt, token as string)
    : changeOwnPassword(cxt)
}

// --- keys

function PerimeterFields(props: { label: string; addresses: string; domains: string }) {
  return (
    <div>
      <div class="field">
        <label for="label">À quoi sert cette clé (pour la reconnaître)</label>
        <br />
        <input
          type="text"
          name="label"
          id="label"
          required
          maxlength={String(MAXIMUM_LABEL_LENGTH)}
          placeholder="Serveur de production"
          value={e(props.label)}
        />
      </div>
      <div class="field">
        <label for="addresses">Adresses IPv4 autorisées (facultatif)</label>
        <br />
        <textarea
          name="addresses"
          id="addresses"
          rows="2"
          cols="50"
          placeholder="203.0.113.7  198.51.100.0/24"
        >{e(props.addresses)}</textarea>
      </div>
      <div class="field">
        <label for="domains">Domaines autorisés (facultatif)</label>
        <br />
        <textarea
          name="domains"
          id="domains"
          rows="2"
          cols="50"
          placeholder="app.exemple.org  *.exemple.org"
        >{e(props.domains)}</textarea>
      </div>
    </div>
  )
}

function PerimeterHelp() {
  return (
    <details>
      <summary>Comment limiter une clé</summary>
      <p>
        Sans adresse ni domaine, la clé sert de partout. Dès qu'il y en a, un appel doit
        venir de l'une des adresses <b>ou</b> de l'un des domaines.
      </p>
      <ul>
        <li>
          <b>Adresse IPv4</b> : celle de votre serveur (<code>203.0.113.7</code>) ou une
          plage (<code>203.0.113.0/24</code>). C'est la protection sûre : une adresse ne
          s'usurpe pas.
        </li>
        <li>
          <b>Domaine</b> : le site dont les pages appellent le Lexicon depuis le
          navigateur (<code>app.exemple.org</code>, ou <code>*.exemple.org</code> pour
          ses sous-domaines). Le navigateur annonce le site d'où part l'appel ; un
          programme peut annoncer ce qu'il veut. Cela empêche de réutiliser sur un autre
          site une clé lue dans une page, rien de plus.
        </li>
      </ul>
      <p>
        Jusqu'à {MAXIMUM_ENTRIES} adresses et {MAXIMUM_ENTRIES} domaines, séparés par des
        espaces, des virgules ou des retours à la ligne. Un changement s'applique en moins
        d'une minute.
      </p>
    </details>
  )
}

/**
 * What a member typed for a key, or what is wrong with it.
 */
function describedKey(form: FormData | undefined) {
  const label = text(form, "label").slice(0, MAXIMUM_LABEL_LENGTH)
  const read = restrictionsIn(text(form, "addresses"), text(form, "domains"))
  const problem =
    label === ""
      ? "Dites à quoi sert la clé, pour la reconnaître plus tard."
      : read.refused.length > 0
        ? `Non reconnu : ${read.refused.slice(0, 5).join(", ")}. Une adresse s'écrit 203.0.113.7 ou 203.0.113.0/24, un domaine app.exemple.org.`
        : read.tooMany
          ? `Pas plus de ${MAXIMUM_ENTRIES} adresses et ${MAXIMUM_ENTRIES} domaines par clé.`
          : undefined

  return { label, restrictions: read.restrictions, problem }
}

function NewKeyPage(props: {
  request: MemberRequest
  title: string
  created: { key: string; prefix: string }
  note?: string
}) {
  return (
    <Layout title={props.title} request={props.request}>
      <p>
        Voici la clé. Elle n'est affichée <b>qu'une seule fois</b> : seule son empreinte
        est conservée. Copiez-la maintenant là où elle servira.
      </p>
      <p class="card info">
        <code style={{ fontSize: "1.2em", userSelect: "all" }}>{e(props.created.key)}</code>
      </p>
      {props.note ? <p>{e(props.note)}</p> : ""}
      <p>
        Elle s'envoie dans l'en-tête <code>Authorization: Bearer …</code> ou{" "}
        <code>X-API-Key</code> de chaque appel, et sera reconnue dans moins d'une minute.
      </p>
      <p>
        <a href={`/account/keys/${e(props.created.prefix)}`}>Voir la clé</a> ·{" "}
        <a href="/account">Toutes mes clés</a>
      </p>
    </Layout>
  )
}

const dashboard = membered(async (request) => {
  const { cxt, member, csrf, form } = request
  const now = Date.now()
  const runs = membershipRuns(member, today())
  const typed = describedKey(form)

  if (form !== undefined && text(form, "action") === "create" && typed.problem === undefined) {
    const created = await createMemberKey(cxt.db, member, typed.label, typed.restrictions)

    if (created !== undefined) {
      return <NewKeyPage request={request} title="Clé créée" created={created} />
    }
  }

  const keys = await memberKeys(cxt.db, member.id)
  const usable = keys.filter((key) => isUsable(key, now))
  const isFull = usable.length >= MAXIMUM_ACTIVE_KEYS
  const error =
    form === undefined
      ? undefined
      : (typed.problem ??
        (isFull
          ? `Vous avez déjà ${MAXIMUM_ACTIVE_KEYS} clés actives : révoquez-en une avant d'en créer une autre.`
          : "La clé n'a pas pu être créée."))

  return (
    <Layout title="Mes clés d'API" request={request}>
      {cxt.query.password === "changed" ? (
        <p class="card info">Votre mot de passe est changé.</p>
      ) : (
        ""
      )}
      {error ? <p class="card error">{e(error)}</p> : ""}
      <Table
        columns={["", ""]}
        rows={[
          ["Adhérent", e(member.name)],
          ["Plan", e(member.plan)],
          [
            "Adhésion",
            member.membership_until === null
              ? "sans échéance"
              : runs
                ? `jusqu'au ${e(member.membership_until)}`
                : `terminée le ${e(member.membership_until)}`,
          ],
          ["Clés actives", `${usable.length} sur ${MAXIMUM_ACTIVE_KEYS}`],
        ]}
      />
      {runs ? (
        ""
      ) : (
        <p class="card error">
          Votre adhésion est terminée : vos clés ont expiré avec elle et vous ne pouvez
          plus en créer. Elles reprendront dès son renouvellement auprès d'OSFarm.
        </p>
      )}

      <h2>Mes clés</h2>
      <Table
        empty="Vous n'avez pas encore de clé."
        columns={[
          "Clé",
          "Usage",
          "Utilisable depuis",
          "Dernière utilisation",
          "Requêtes sur 30 jours",
          "État",
        ]}
        rows={keys.map((key) => [
          <a href={`/account/keys/${e(key.prefix)}`}>lex_{e(key.prefix)}_…</a>,
          e(key.label ?? "—"),
          e(perimeterOf(key)),
          moment(key.last_used_at),
          cxt.numberFormatter(Number(key.requests)),
          stateOf(key, now),
        ])}
      />

      {runs && !isFull ? (
        <div>
          <h2>Nouvelle clé</h2>
          <form method="POST" action="/account">
            <Hidden csrf={csrf} action="create" />
            <PerimeterFields
              label={form === undefined ? "" : text(form, "label")}
              addresses={text(form, "addresses")}
              domains={text(form, "domains")}
            />
            <button class="button" type="submit">
              Créer la clé
            </button>
          </form>
          <PerimeterHelp />
        </div>
      ) : (
        ""
      )}
    </Layout>
  )
})

const keyDetail = membered(async (request) => {
  const { cxt, member, csrf, form } = request
  const prefix = cxt.params.prefix
  const key = await findMemberKey(cxt.db, member, prefix)

  // The key of another member is as unknown as one that does not exist
  if (key === undefined) {
    return new Response("Clé inconnue", { status: 404 })
  }

  const now = Date.now()
  const action = text(form, "action")
  const typed = describedKey(form)

  if (action === "revoke") {
    await revokeMemberKey(cxt.db, member, prefix)

    return redirect(`/account/keys/${prefix}`)
  }
  if (action === "replace" && isUsable(key, now)) {
    const created = await replaceMemberKey(cxt.db, member, key)

    if (created !== undefined) {
      return (
        <NewKeyPage
          request={request}
          title="Clé remplacée"
         
          created={created}
          note={`L'ancienne (lex_${key.prefix}_…) reste valable ${REPLACEMENT_OVERLAP_IN_DAYS} jours, le temps de la remplacer partout où elle sert.`}
        />
      )
    }
  }
  if (action === "describe" && typed.problem === undefined && key.revoked_at === null) {
    await describeMemberKey(cxt.db, member, prefix, typed.label, typed.restrictions)

    return redirect(`/account/keys/${prefix}`)
  }

  const error =
    action === "describe"
      ? typed.problem
      : action === "replace"
        ? "La clé n'a pas pu être remplacée : trop de clés sont encore actives, ou votre adhésion est terminée."
        : undefined
  const usage = await usageOf(cxt.db, 30, prefix)
  const isRevoked = key.revoked_at !== null

  return (
    <Layout title={`Clé lex_${key.prefix}_…`} request={request}>
      {error ? <p class="card error">{e(error)}</p> : ""}
      <Table
        columns={["", ""]}
        rows={[
          ["Usage", e(key.label ?? "—")],
          ["Utilisable depuis", e(perimeterOf(key))],
          ["Plan", e(key.plan)],
          ["Créée le", day(key.created_at)],
          ["Expire le", day(key.expires_at)],
          ["Dernière utilisation", moment(key.last_used_at)],
          ["État", stateOf(key, now)],
        ]}
      />
      <p>
        Le secret de la clé n'est pas conservé : s'il est perdu ou a fuité, remplacez la
        clé.
      </p>
      {isRevoked ? (
        ""
      ) : (
        <div>
          <h2>Usage et périmètre</h2>
          <form method="POST">
            <Hidden csrf={csrf} action="describe" />
            <PerimeterFields
              label={action === "describe" ? text(form, "label") : (key.label ?? "")}
              addresses={
                action === "describe"
                  ? text(form, "addresses")
                  : key.allowed_addresses.join("\n")
              }
              domains={
                action === "describe" ? text(form, "domains") : key.allowed_domains.join("\n")
              }
            />
            <button class="button" type="submit">
              Enregistrer
            </button>
          </form>
          <PerimeterHelp />

          <h2>Remplacer ou révoquer</h2>
          {isUsable(key, now) ? (
            <form method="POST">
              <Hidden csrf={csrf} action="replace" />
              <button class="button" type="submit">
                Remplacer (nouvelle clé, celle-ci reste valable{" "}
                {REPLACEMENT_OVERLAP_IN_DAYS} jours)
              </button>
            </form>
          ) : (
            ""
          )}
          <form method="POST">
            <Hidden csrf={csrf} action="revoke" />
            <button class="button" type="submit">
              Révoquer définitivement
            </button>
          </form>
          <p>
            Une clé révoquée cesse de fonctionner en moins d'une minute et ne peut pas être
            rétablie.
          </p>
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
      <p>
        <a href="/account">Toutes mes clés</a>
      </p>
    </Layout>
  )
})

export const Account = API.new()
  .restrictedTo(ACCOUNT_SCOPE)
  .path("/account", dashboard)
  .path("/account/login", login)
  .path("/account/logout", logout)
  .path("/account/forgot", forgot)
  .path("/account/password", password)
  .path("/account/keys/:prefix", keyDetail)
  .path("/account/collections", collections)
  .path("/account/collections/new", newCollection)
  .path("/account/collections/:id", collectionDetail)
  .path("/account/collections/:id/data", collectionData)
  .path("/account/collections/:id/session", collectionSession)
  .path("/account/collections/:id/csv", collectionExport)

