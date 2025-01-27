import { Layout } from "./Layout"
import { html, Html } from "@elysiajs/html"

export function Home() {
  return (
    <Layout title="Accueil" breadcrumbs={[]}>
      <ul>
        <li>
          <a href="/geographical-references">Références géographiques</a>
        </li>
        <li>
          <a href="/phytosanitary">Phytosanitaire</a>
        </li>
        <li>
          <a href="/viticulture">Viticulture</a>
        </li>
        <li>
          <a href="/weather">Météorologie</a>
        </li>
      </ul>
    </Layout>
  )
}
