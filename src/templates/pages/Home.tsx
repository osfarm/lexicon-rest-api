import type { Translator } from "../../Translator"
import { Layout } from "../layouts/Layout"
import { html, Html } from "@elysiajs/html"
import { Card } from "./../components/Card"
import { Cell, Grid } from "./../components/Grid"
import { SectionLink } from "./../components/SectionLink"

interface Props {
  t: Translator
}

export function Home(props: Props) {
  const { t } = props

  return (
    <Layout title={t("home_title")} breadcrumbs={[]} t={t}>
      <Card info>
        <p>
          <img src={"/public/icons/circle-info.svg"} height={13} /> {t("home_warning")}
        </p>
      </Card>

      <h2>{t("home_explore")}</h2>

      <Grid>
        <Cell width={6}>
          <SectionLink
            href="/geographical-references"
            icon-left="/public/icons/land-parcels.svg"
          >
            {t("geographical_references_title")}
          </SectionLink>
        </Cell>
        <Cell width={6}>
          <SectionLink
            href="/phytosanitary"
            icon-left="/public/icons/chemical-product.svg"
          >
            {t("phytosanitary_title")}
          </SectionLink>
        </Cell>
        <Cell width={6}>
          <SectionLink href="/production" icon-left="/public/icons/farm.svg">
            {t("production_title")}
          </SectionLink>
        </Cell>
        <Cell width={6}>
          <SectionLink href="/seeds" icon-left="/public/icons/seed.svg">
            {t("seeds_title")}
          </SectionLink>
        </Cell>
        <Cell width={6}>
          <SectionLink href="/viticulture" icon-left="/public/icons/bottles.svg">
            {t("viticulture_title")}
          </SectionLink>
        </Cell>
        <Cell width={6}>
          <SectionLink href="/weather" icon-left="/public/icons/cloud.svg">
            {t("weather_title")}
          </SectionLink>
        </Cell>
      </Grid>

      <h2>{t("home_tools")}</h2>

      <Grid>
        <Cell width={6}>
          <SectionLink
            href="/tools/parcel-identifier"
            icon-left="/public/icons/marker.svg"
          >
            {t("tools_parcel_identifier")}
          </SectionLink>
        </Cell>
      </Grid>

      <h2>{t("home_how_to_use")}</h2>

      <div
        style={{
          textAlign: "center",
          width: "100%",
          fontSize: "1.1em",
          fontWeight: "bold",
        }}
      >
        <ol style={{ display: "inline-block", textAlign: "left" }}>
          <li>{t("home_how_to_step1")}</li>
          <li>{t("home_how_to_step2")}</li>
          <li>{t("home_how_to_step3")}</li>
        </ol>
      </div>

      <div style={{ width: "50%", marginLeft: "auto", marginRight: "auto" }}>
        <SectionLink
          href="/documentation"
          icon-left="/public/icons/book.svg"
          target="_blank"
        >
          {t("home_full_documentation")}
        </SectionLink>
      </div>

      <br />
    </Layout>
  )
}
