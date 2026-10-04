import { Html } from "@elysiajs/html"

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
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href="/public/style.css" />
        <link rel="icon" type="image/x-icon" href="/public/images/favicon.ico" />
        <title>{e(props.title)} — Lexicon</title>
      </head>
      <body>
        <nav>
          <header>
            <div class="col">
              <h1>Lexicon — administration</h1>
            </div>
            <div class="col center">
              {props.admin
                ? SECTIONS.map(([href, label]) => <a href={href}>{label}</a>)
                : ""}
            </div>
            <div class="col right">
              {props.admin ? (
                <form method="POST" action="/admin/logout" style={{ margin: "0" }}>
                  <input type="hidden" name="csrf" value={props.csrf} />
                  <span>{e(props.admin.email)} </span>
                  <button class="button" type="submit">
                    Déconnexion
                  </button>
                </form>
              ) : (
                ""
              )}
            </div>
          </header>
        </nav>
        <main
          class="container"
          style={{ margin: "20px auto", width: "100%", maxWidth: "1100px" }}
        >
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
    <table style={{ width: "100%" }}>
      <thead>
        <tr>
          {props.columns.map((column) => (
            <th style={{ textAlign: "left" }}>{e(column)}</th>
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
