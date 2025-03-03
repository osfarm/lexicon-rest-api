import { Home } from "./templates/pages/Home"
import { Credits } from "./namespaces/Credits"
import { Phytosanitary } from "./namespaces/Phytosanitary"
import { GeographicalReferences } from "./namespaces/GeographicalReferences"
import { Viticulture } from "./namespaces/Viticulture"
import { Weather } from "./namespaces/Weather"
import { generateDocumentation } from "./page-generators/generateDocumentation"
import { Tools } from "./namespaces/Tools"
import { API } from "./API"
import { Production } from "./namespaces/Production"
import { Seeds } from "./namespaces/Seeds"

const PORT = import.meta.env.PORT as string

API.new()
  .path("/", ({ t }) => Home({ t }))
  .path("/documentation", ({ t, output }) => generateDocumentation(t, output))
  .use(Tools)
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Production)
  .use(Seeds)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
  .listen(PORT)
