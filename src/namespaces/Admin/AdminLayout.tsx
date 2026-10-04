import { Html } from "@elysiajs/html"
import { asset } from "../../templates/Assets"

type Props = {
  title: string
  // Undefined on the login page
  admin?: { email: string }
  csrf?: string
  children: any
}

const SECTIONS = [
  ["/admin", "Synthèse"],
  ["/admin/keys", "Clés"],
  ["/admin/plans", "Plans"],
  ["/admin/usage", "Consommation"],
  ["/admin/datasources", "Datasources"],
  ["/admin/assistant", "Duke"],
  ["/admin/audit", "Journal"],
]

export const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

/**
 * Layout of the administration pages. Unlike the public layout, it loads no
 * script from another site: nothing foreign runs where keys are managed.
 */
export function AdminLayout(props: Props) {
  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href={asset("style.css")} />
        <link rel="icon" type="image/svg+xml" href="/public/images/lexicon-mark.svg" />
        <link
          rel="alternate icon"
          type="image/x-icon"
          href="/public/images/favicon.ico"
        />
        <title>{e(props.title)} — Lexicon, administration</title>
      </head>
      <body class="admin">
        <header class="site-header">
          <div class="site-header-inner">
            <a class="brand" href="/admin">
              <img src="/public/images/lexicon-mark.svg" alt="" width="40" height="40" />
              lexicon <small>administration</small>
            </a>
            {props.admin ? (
              <nav class="site-nav" aria-label="Administration">
                {SECTIONS.map(([href, label]) => (
                  <a href={href}>{label}</a>
                ))}
              </nav>
            ) : (
              ""
            )}
            {props.admin ? (
              <div class="account">
                <span>{e(props.admin.email)}</span>
                <form method="POST" action="/admin/logout">
                  <input type="hidden" name="csrf" value={props.csrf} />
                  <button class="button small" type="submit">
                    Déconnexion
                  </button>
                </form>
              </div>
            ) : (
              ""
            )}
          </div>
        </header>
        <main class="page">
          <h1>{e(props.title)}</h1>
          {props.children}
        </main>
      </body>
    </html>
  )
}

export function Table(props: { columns: string[]; rows: unknown[][]; empty?: string }) {
  return props.rows.length === 0 ? (
    <p>
      <i>{e(props.empty ?? "Rien à afficher.")}</i>
    </p>
  ) : (
    <table>
      <thead>
        <tr>
          {props.columns.map((column) => (
            <th>{e(column)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr>
            {row.map((cell) => (
              <td>{cell as any}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
