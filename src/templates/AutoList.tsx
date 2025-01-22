import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../Hypermedia"
import { Layout } from "./Layout"

interface PageData {
  page: {
    title: string
    breadcrumbs: HypermediaType["Link"][]
    links: HypermediaType["Link"][]
  }
}

export function AutoList(props: PageData) {
  const { page } = props

  return (
    <Layout title={page.title} breadcrumbs={page.breadcrumbs}>
      <ul>
        {page.links.map((link) => (
          <li>
            <a href={link.href}>{link.value}</a>
          </li>
        ))}
      </ul>
    </Layout>
  )
}
