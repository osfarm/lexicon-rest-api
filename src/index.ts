import { Elysia, t } from "elysia"
import { html, Html } from "@elysiajs/html"
import { Home } from "./templates/Home"
import { Credits } from "./namespaces/Credits"
import { staticPlugin } from "@elysiajs/static"
import { Phytosanitary } from "./namespaces/Phytosanitary"
import { GeographicalReferences } from "./namespaces/GeographicalReferences"
import cors from "@elysiajs/cors"
import { Viticulture } from "./namespaces/Viticulture"
import { Weather } from "./namespaces/Weather"
import { generateDocumentation } from "./page-generators/generateDocumentation"
import { applyRequestConfiguration } from "./applyRequestConfiguration"
import { Seed } from "./namespaces/Seed"
import { Production } from "./namespaces/Production"

const PORT = import.meta.env.PORT as string

new Elysia({ serve: { idleTimeout: 255 } })
  .use(staticPlugin())
  .use(cors())
  .use(html())
  .derive(applyRequestConfiguration)
  .get("/", ({ t }) => Home({ t }))
  .get("/documentation*", ({ t, output }) => generateDocumentation(t, output))
  .guard({
    query: t.Object({ page: t.Number({ default: 1 }) }),
  })
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Production)
  .use(Seed)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
  .listen(PORT)

console.log("Lexicon REST API is open on port " + PORT)
console.info("Access the server on http://localhost:" + PORT)
