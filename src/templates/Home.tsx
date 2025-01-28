import { isPropertySignature } from "typescript"
import type { Translator } from "../Translator"
import { Layout } from "./Layout"
import { html, Html } from "@elysiajs/html"
import { Card } from "./components/Card"
import { Cell, Grid } from "./components/Grid"

interface Props {
  t: Translator
}

const SECTION_STYLE = {
  borderRadius: "15px",
  fontSize: "1.3em",
  color: "black",
  border: "solid 1px black",
  padding: "5px",
  width: "100%",
  textAlign: "center",
} as const

export function Home(props: Props) {
  const { t } = props

  return (
    <Layout title={t("home_title")} breadcrumbs={[]}>
      <Card info>
        <p>
          <img src={"/public/icons/circle-info.svg"} height={13} />{" "}
          {t("home_warning")}
        </p>
      </Card>

      <h2>{t("home_explore")}</h2>

      <Grid>
        <Cell width={6}>
          <a href="/geographical-references" style={SECTION_STYLE}>
            <img src={"/public/icons/map.svg"} height={16} />{" "}
            {t("geographical_references_title")}
          </a>{" "}
        </Cell>

        <Cell width={6}>
          <a href="/phytosanitary" style={SECTION_STYLE}>
            <img src={"/public/icons/prescription-bottle.svg"} height={16} />{" "}
            {t("phytosanitary_title")}
          </a>
        </Cell>
        <Cell width={6}>
          <a href="/viticulture" style={SECTION_STYLE}>
            <img src={"/public/icons/wine.svg"} height={16} />{" "}
            {t("viticulture_title")}
          </a>{" "}
        </Cell>
        <Cell width={6}>
          <a href="/weather" style={SECTION_STYLE}>
            <img src={"/public/icons/cloud.svg"} height={16} />{" "}
            {t("weather_title")}
          </a>
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

      <br />

      {/* <div style={{ marginLeft: "auto", marginRight: "auto" }}>
        <img src="/public/images/osfarm-logo.png" />
      </div> */}
    </Layout>
  )
}
