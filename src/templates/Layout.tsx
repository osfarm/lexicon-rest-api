import { html, Html } from "@elysiajs/html"
import { Breadcrumbs } from "./components/Breadcrumbs"
import type { HypermediaType } from "../Hypermedia"

type Props = {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  children: any
}

export function Layout(props: Props) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <link rel="stylesheet" href="/public/style.css" />
        <title>{props.title}</title>
      </head>

      <body>
        <nav>
          <header>
            <div class="col">
              {/* <img src="/public/images/lexicon-icon.svg" width={90} /> */}
              <h1>Lexicon</h1>
            </div>
            <div class="col center"></div>
            <div class="col right"></div>
          </header>
        </nav>

        <br />

        <main
          class="container"
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            width: "100%",
            maxWidth: "1024px",
          }}
        >
          <Breadcrumbs pageTitle={props.title} links={props.breadcrumbs} />

          <h1>{props.title}</h1>

          <div
            class="segment"
            style={{
              width: "100%",
              minHeight: "30px",
              padding: "10px",
              borderRadius: "15px",
              outline: "2px solid transparent",
              outlineOffset: "2px",
              backgroundColor: "hsla(0, 0%, 100%, 0.05)",
              borderColor: "transparent",
              overflow: "hidden",
              boxSizing: "border-box",
              position: "relative",
              boxShadow: "rgba(100, 100, 111, 0.2) 0px 7px 29px 0px",
            }}
          >
            {props.children}
          </div>
        </main>

        <footer style={{ textAlign: "center", marginTop: "25px" }}>
          <a href="/documentation" target="_blank">
            Documentation
          </a>
          {" • "}
          <a href="/credits">Crédits</a> {" • "}
          <a href="https://github.com/osfarm/lexicon" target="_blank">
            GitHub
          </a>
          {" • "}
          <a href="https://www.osfarm.org/">OSFarm</a>
        </footer>
      </body>
    </html>
  )
}
