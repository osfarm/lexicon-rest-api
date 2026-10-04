import { Home } from "./templates/pages/Home"
import { Explore } from "./templates/pages/Explore"
import { chooseLanguage } from "./Language"
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
import { Enterprises } from "./namespaces/Enterprises"
import { Rica } from "./namespaces/Rica"
import { Admin } from "./namespaces/Admin"
import { Bundles } from "./namespaces/Bundles"
import { Catalog } from "./namespaces/Catalog"
import { Links } from "./namespaces/Links"
import { Mcp } from "./namespaces/Mcp"
import { RdAgri } from "./namespaces/RdAgri"

const PORT = import.meta.env.PORT as string

API.new()
  .path("/", (cxt) => Home(cxt))
  .path("/explore", ({ t }) => Explore({ t }))
  .path("/language/:code", chooseLanguage)
  .path("/documentation", ({ t, output }) => generateDocumentation(t, output))
  .use(Tools)
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Production)
  .use(Enterprises)
  .use(Rica)
  .use(Seeds)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
  .use(Admin)
  .use(Bundles)
  .use(Catalog)
  .use(Links)
  .use(Mcp)
  .use(RdAgri)
  .listen(PORT)
