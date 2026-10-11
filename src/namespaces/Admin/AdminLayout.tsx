import { Html } from "@elysiajs/html"
import { asset } from "../../templates/Assets"

type Props = {
  title: string
  // Undefined on the login page
  admin?: { email: string }
  csrf?: string
  // The member area borrows this layout: its own home, name, sections and logout
  area?: Area
  children: any
}

export type Area = Readonly<{
  home: string
  name: string
  logout: string
  sections: readonly (readonly [string, string])[]
}>

const SECTIONS = [
  ["/admin", "Synthèse"],
  ["/admin/members", "Adhérents"],
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
  const area: Area = props.area ?? {
    home: "/admin",
    name: "administration",
    logout: "/admin/logout",
    sections: SECTIONS as [string, string][],
  }

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
        <title>
          {e(props.title)} — Lexicon, {e(area.name)}
        </title>
      </head>
      <body class="admin">
        <header class="site-header">
          <div class="site-header-inner">
            <a class="brand" href={area.home}>
              <img src="/public/images/lexicon-mark.svg" alt="" width="40" height="40" />
              lexicon <small>{e(area.name)}</small>
            </a>
            {props.admin ? (
              // The menu opens from the top right corner. It is a <details>: no script is needed
              <details class="console-menu">
                <summary aria-label="Menu">
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path
                      d="M4 6.5h16M4 12h16M4 17.5h16"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </summary>
                <div class="console-menu-panel">
                  <p class="console-menu-account">{e(props.admin.email)}</p>
                  <nav aria-label={e(area.name)}>
                    {area.sections.map(([href, label]) => (
                      <a href={href}>{label}</a>
                    ))}
                  </nav>
                  <form method="POST" action={area.logout}>
                    <input type="hidden" name="csrf" value={props.csrf} />
                    <button class="button small" type="submit">
                      Déconnexion
                    </button>
                  </form>
                </div>
              </details>
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
