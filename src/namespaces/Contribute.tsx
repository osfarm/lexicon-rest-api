import { Html } from "@elysiajs/html"
import { API } from "../API"
import {
  ACCEPTANCE_EXAMPLE,
  FILE_ANSWERS,
  NOTES,
  PIVOTS,
  REFUSAL_EXAMPLE,
  REPOSITORY,
  SHEET_ANSWERS,
  SHEET_EXAMPLE,
  SHEET_FIELDS,
  TABLE_EXAMPLE,
  TYPES,
} from "../contribute/Guide"
import {
  expiredKeyCookie,
  keyCookie,
  keyIn,
  relay,
  WORKSHOP_PATH,
  workshopOf,
} from "../contribute/Workshop"
import { holderOfKey } from "../access"
import { forgetLoginAttempts, mayAttemptLogin } from "../access/AdminSession"
import { CONTRIBUTE_SCOPE } from "../access/Plan"
import { addressOf, isPost, isSecure, redirect } from "./Admin/session"
import type { Context } from "../types/Context"
import { Hypermedia } from "../Hypermedia"
import { Layout } from "../templates/layouts/Layout"
import type { Translator } from "../Translator"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

function Sample(props: { text: string }) {
  return (
    <pre>
      <code>{e(props.text)}</code>
    </pre>
  )
}

function Glossary(props: {
  heads: [string, string]
  entries: { name: string; meaning: string }[]
}) {
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{props.heads[0]}</th>
            <th>{props.heads[1]}</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.map((entry) => (
            <tr>
              <td>
                <code>{e(entry.name)}</code>
              </td>
              <td>{e(entry.meaning)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Answers(props: { answers: { says: string; remedy: string }[] }) {
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>La commande répond</th>
            <th>Ce qu'il faut faire</th>
          </tr>
        </thead>
        <tbody>
          {props.answers.map((answer) => (
            <tr>
              <td>{e(answer.says)}</td>
              <td>{e(answer.remedy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The guide of `./lexicon contribute` for someone who wants to propose a dataset. In French, as the
 * command itself answers in French.
 */
export function ContributePage(props: { t: Translator }) {
  const { t } = props

  return (
    <Layout
      title={t("contribute_title")}
      breadcrumbs={[
        Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
      ]}
      t={t}
      section="catalog"
    >
      <p class="prose">
        Un jeu de données qui tient dans un ou plusieurs tableaux entre au Lexicon sans
        une ligne de code : un dossier, une fiche qui le décrit, et les tableaux en CSV.
        La commande <code>./lexicon contribute</code> relit ce dossier comme le fera un
        mainteneur d'OSFarm et dit, en français et ligne à l'appui, ce qui reste à
        corriger.
      </p>
      <div class="notice">
        <p>
          La commande ne publie rien et n'envoie rien : elle lit vos fichiers sur votre
          poste. Rien n'est mis en service sans la relecture d'un mainteneur.
        </p>
      </div>
      <div class="notice" id="en-ligne">
        <p>
          <strong>Sans rien installer :</strong> avec une clé d'API du Lexicon,{" "}
          <a href={WORKSHOP_PATH}>l'outil de contribution en ligne</a> fait la même
          relecture dans le navigateur. On y dépose son tableau (CSV, Excel ou
          LibreOffice), on remplit la fiche dans un formulaire, puis on propose le jeu
          d'un bouton.
        </p>
      </div>

      <h2>En bref</h2>
      <ol class="steps">
        <li>
          <a href="#installer">Installer l'outil</a> sur son poste.
        </li>
        <li>
          <a href="#tableau">Préparer le tableau</a> et l'enregistrer en CSV.
        </li>
        <li>
          <a href="#fiche">Remplir la fiche</a> <code>dataset.yml</code>.
        </li>
        <li>
          <a href="#verifier">Vérifier</a> avec <code>./lexicon contribute</code>,
          corriger, recommencer.
        </li>
        <li>
          <a href="#proposer">Proposer</a> le dossier une fois la réponse{" "}
          <code>[ OK ]</code> obtenue.
        </li>
      </ol>

      <h2 id="installer">1. Installer l'outil</h2>
      <p class="prose">
        Il faut <a href="https://git-scm.com/">Git</a> et{" "}
        <a href="https://docs.docker.com/get-docker/">Docker</a>. L'outil est le dépôt du
        Lexicon lui-même ; son premier lancement construit une image, ce qui prend
        quelques minutes.
      </p>
      <Sample
        text={`git clone ${REPOSITORY}.git\ncd lexicon\ncp .env.dist .env\n./lexicon new releves_sol --tabular`}
      />
      <p class="prose">
        La dernière commande affiche le modèle de fiche pour un jeu nommé{" "}
        <code>releves_sol</code>. Le nom du jeu est en minuscules, sans accent ni espace.
      </p>

      <h2 id="tableau">2. Préparer le tableau</h2>
      <p class="prose">
        Créer le dossier du jeu dans <code>data/contributions/</code> et y enregistrer le
        tableau depuis le tableur : « Enregistrer sous », format CSV, encodage UTF-8,
        séparateur virgule.
      </p>
      <Sample
        text={`data/contributions/releves_sol/\n├── dataset.yml      la fiche\n└── releves.csv      le tableau`}
      />
      <ul class="steps">
        <li>
          La première ligne donne le nom des colonnes, en minuscules, sans accent ni
          espace : <code>insee_code</code>, pas « Code INSEE ».
        </li>
        <li>
          Une colonne identifie chaque ligne : jamais vide, jamais deux fois la même
          valeur.
        </li>
        <li>
          Les dates s'écrivent <code>2026-09-30</code>, les nombres avec un point (
          <code>12.5</code>), les oui/non <code>true</code> ou <code>false</code>.
        </li>
        <li>
          Une case vide veut dire « pas de valeur » : elle est acceptée partout, sauf dans
          la colonne qui identifie les lignes.
        </li>
      </ul>
      <Sample text={TABLE_EXAMPLE} />

      <h2 id="fiche">3. Remplir la fiche</h2>
      <p class="prose">
        Enregistrer le modèle sous <code>data/contributions/releves_sol/dataset.yml</code>
        , puis remplacer chaque texte d'exemple. La fiche dit ce qu'est le jeu, d'où il
        vient, sous quelle licence, et ce que contient chaque colonne.
      </p>
      <Sample text={SHEET_EXAMPLE} />
      <Glossary heads={["Rubrique", "Ce qu'elle dit"]} entries={SHEET_FIELDS} />

      <h3>Les types de colonnes</h3>
      <Glossary heads={["Type", "Ce que contient la colonne"]} entries={TYPES} />

      <h3>Les liens avec les autres jeux</h3>
      <p class="prose">
        Sous <code>pivots</code>, on dit qu'une colonne porte un identifiant partagé :{" "}
        <code>insee_code: commune</code>. Le jeu est alors relié aux autres, par exemple
        sur la page d'une commune.
      </p>
      <Glossary heads={["Clé", "Ce que porte la colonne"]} entries={PIVOTS} />

      <h2 id="verifier">4. Vérifier</h2>
      <Sample text="./lexicon contribute releves_sol" />
      <p class="prose">
        Chaque ligne « à corriger » nomme le fichier, la colonne et les cases en cause.
        Les lignes « à savoir » ne bloquent pas. La commande compte ce qui reste :
      </p>
      <Sample text={REFUSAL_EXAMPLE} />
      <p class="prose">Corriger, relancer la commande, jusqu'à cette réponse :</p>
      <Sample text={ACCEPTANCE_EXAMPLE} />

      <h3>Dans un navigateur</h3>
      <p class="prose">
        Le plus simple est de passer par la page web, sur votre poste : on y dépose son
        tableau tel qu'il est (CSV, Excel ou LibreOffice) et la fiche se remplit toute
        seule. Les colonnes sont reconnues et renommées, leur type est deviné, les dates
        et les nombres sont remis en forme, la colonne qui identifie chaque ligne est
        choisie. Il reste à vérifier ce qui a été reconnu et à dire d'où vient le jeu.
      </p>
      <Sample text="./lexicon contribute --web" />
      <p class="prose">
        Ouvrir ensuite <code>http://localhost:8787</code>. La page ne répond que sur votre
        poste et n'envoie rien ; <code>Ctrl-C</code> l'arrête.
      </p>

      <h3>Ce que la commande dit de la fiche</h3>
      <Answers answers={SHEET_ANSWERS} />

      <h3>Ce qu'elle dit d'un tableau</h3>
      <Answers answers={FILE_ANSWERS} />

      <h3>Ce qu'elle signale sans bloquer</h3>
      <Answers answers={NOTES} />

      <h3>Ce qu'elle ne vérifie pas</h3>
      <ul class="steps">
        <li>
          Que les identifiants des colonnes de lien existent : un code de commune inconnu
          n'est vu qu'à la construction du jeu, par le mainteneur.
        </li>
        <li>Que les valeurs sont justes : elle lit leur forme, pas leur sens.</li>
        <li>
          Que la licence écrite est bien celle de la source : c'est à vous de le dire.
        </li>
      </ul>

      <h2 id="proposer">5. Proposer</h2>
      <p class="prose">
        Quand la commande répond <code>[ OK ]</code>, envoyer le dossier par une demande
        de fusion sur <a href={REPOSITORY}>le dépôt du Lexicon</a>, ou le transmettre à un
        mainteneur d'<a href="https://www.osfarm.org/">OSFarm</a>. Le mainteneur relit le
        jeu, le construit et le publie ; il apparaît alors au{" "}
        <a href="/catalog">catalogue</a>, avec votre nom dans les crédits.
      </p>

      <h2>Ce qu'un tableau ne sait pas faire</h2>
      <p class="prose">
        Télécharger sa source, transformer les données, porter une géométrie, se lier à un
        autre jeu par une clé étrangère. Pour cela il faut écrire une source de données en
        Ruby : voir{" "}
        <a href={`${REPOSITORY}/blob/main/doc/CONTRIBUTING.md`}>le guide du dépôt</a>.
      </p>
    </Layout>
  )
}

const workshop = workshopOf({
  CONTRIBUTE_URL: import.meta.env.CONTRIBUTE_URL,
  CONTRIBUTE_SECRET: import.meta.env.CONTRIBUTE_SECRET,
})
const keyAttempts = new Map<string, number[]>()

/**
 * Where a visitor gives the key that opens the tool, or reads that this site has no tool to offer.
 */
export function WorkshopDoor(props: { t: Translator; available: boolean; error?: string }) {
  const { t } = props

  return (
    <Layout
      title="Outil de contribution"
      breadcrumbs={[
        Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
        Hypermedia.Link({ value: t("contribute_title"), method: "GET", href: "/contribute" }),
      ]}
      t={t}
      section="catalog"
    >
      {props.available ? (
        <>
          <p class="prose">
            L'outil relit votre tableau comme le fera un mainteneur d'OSFarm : déposez-le,
            remplissez la fiche, proposez le jeu. Vos jeux sont gardés sur le serveur du
            Lexicon, dans un espace propre à votre clé d'API ; rien n'est mis en service
            sans la relecture d'un mainteneur.
          </p>
          {props.error ? <p class="card error">{e(props.error)}</p> : ""}
          <form method="POST" action={WORKSHOP_PATH + "/cle"}>
            <div class="field">
              <label for="key">Votre clé d'API</label>
              <br />
              <input
                type="password"
                name="key"
                id="key"
                required
                autocomplete="off"
                placeholder="lex_…"
                size="50"
              />
            </div>
            <button class="button" type="submit">
              Ouvrir l'outil
            </button>
          </form>
          <p class="prose">
            Pas de clé ? Elle se demande à OSFarm. Sans clé, l'outil s'installe aussi sur
            son poste : voir <a href="/contribute#installer">le guide</a>.
          </p>
        </>
      ) : (
        <p class="prose">
          L'outil de contribution en ligne n'est pas disponible sur ce site. Il s'installe
          sur son poste : voir <a href="/contribute#installer">le guide</a>.
        </p>
      )}
    </Layout>
  )
}

function door(cxt: Context, error?: string, status = 200) {
  return new Response(
    String(WorkshopDoor({ t: cxt.t, available: workshop !== undefined, error })),
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  )
}

// The key is asked once, then kept in a cookie for the tool alone
async function enter(cxt: Context) {
  if (workshop === undefined || !isPost(cxt)) {
    return redirect(WORKSHOP_PATH)
  }

  const address = addressOf(cxt)
  if (!mayAttemptLogin(keyAttempts, address, Date.now())) {
    return door(cxt, "Trop de tentatives. Réessayez dans un quart d'heure.", 429)
  }

  const key = String((await cxt.request.formData()).get("key") ?? "").trim()
  const holder = await holderOfKey(cxt.db, key)

  if (holder === undefined) {
    return door(cxt, "Cette clé n'est pas reconnue, ou n'est plus valable.", 401)
  }
  forgetLoginAttempts(keyAttempts, address)

  return redirect(WORKSHOP_PATH, { "Set-Cookie": keyCookie(key, isSecure(cxt)) })
}

function leave() {
  return redirect(WORKSHOP_PATH, { "Set-Cookie": expiredKeyCookie() })
}

// Every page and every change of the tool: relayed for the holder of the key, to their workspace
async function work(cxt: Context) {
  const key = keyIn(cxt.request.headers.get("cookie"))
  const holder =
    workshop === undefined || key === undefined
      ? undefined
      : await holderOfKey(cxt.db, key)

  if (workshop === undefined || holder === undefined) {
    return cxt.request.method === "GET" &&
      new URL(cxt.request.url).pathname === WORKSHOP_PATH
      ? door(cxt)
      : new Response("Votre session est terminée : rouvrez l'outil avec votre clé.", {
          status: 401,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
  }

  return relay(workshop, cxt.request, holder.label)
}

export const Contribute = API.new()
  .path("/contribute", ({ t }) => ContributePage({ t }))
  .restrictedTo(CONTRIBUTE_SCOPE)
  .path(WORKSHOP_PATH, work)
  .path(WORKSHOP_PATH + "/cle", enter)
  .path(WORKSHOP_PATH + "/sortir", leave)
  .path(WORKSHOP_PATH + "/*", work)
