import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../Hypermedia"
import { Layout } from "./layouts/Layout"
import type { Translator } from "../Translator"

interface PageData {
  page: {
    title: string
    breadcrumbs: HypermediaType["Link"][]
    links: HypermediaType["Link"][]
  }
  t: Translator
}

export function AutoList(props: PageData) {
  const { page, t } = props

  return (
    <Layout title={page.title} breadcrumbs={page.breadcrumbs} t={t}>
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
