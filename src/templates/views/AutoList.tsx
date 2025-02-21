import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../../Hypermedia"
import { Layout } from "../layouts/Layout"
import type { Translator } from "../../Translator"
import { SectionLink } from "../components/SectionLink"
import { Cell, Grid } from "../components/Grid"

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
      <h2>{t("datasets")}</h2>
      <Grid>
        {page.links.map((link) => (
          <Cell width={6}>
            <SectionLink
              href={link.href}
              icon-left={link.icon}
              icon-right="/public/icons/chevron-right.svg"
            >
              {link.value}
            </SectionLink>
          </Cell>
        ))}
      </Grid>
    </Layout>
  )
}
