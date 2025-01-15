import { Layout } from "./Layout"
import { html, Html } from "@elysiajs/html"

export function Home() {
  return (
    <Layout title="Accueil" breadcrumbs={[]}>
      <p>Hello, world!</p>
    </Layout>
  )
}
