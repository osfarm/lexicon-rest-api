import { Html } from "@elysiajs/html"
import type { Family } from "../../home/Weave"
import { Hypermedia } from "../../Hypermedia"
import type { Translator } from "../../Translator"
import { Layout } from "../layouts/Layout"

interface Props {
  t: Translator
}

// The sections of data, each with the family of the logo it belongs to
const SECTIONS: [string, string, Family][] = [
  ["/geographical-references", "geographical_references", "places"],
  ["/enterprises", "enterprises", "farms"],
  ["/production", "production", "crops"],
  ["/phytosanitary", "phytosanitary", "crops"],
  ["/seeds", "seeds", "crops"],
  ["/viticulture", "viticulture", "crops"],
  ["/rd-agri", "rd_agri", "crops"],
  ["/weather", "weather", "environment"],
]

const TOOLS: [string, string][] = [
  ["/tools/parcel-identifier", "tools_parcel_identifier"],
  ["/tools/assistant", "tools_assistant"],
]

/**
 * The index of the data: what the home page used to list.
 */
export function Explore(props: Props) {
  const { t } = props

  return (
    <Layout
      title={t("nav_explore")}
      breadcrumbs={[
        Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
      ]}
      t={t}
      section="explore"
    >
      <p class="prose">{t("explore_lead")}</p>

      <h2>{t("home_explore")}</h2>
      <ul class="index">
        {SECTIONS.map(([href, key, family]) => (
          <li>
            <a class={`entry dot family-${family}`} href={href}>
              {t(key + "_title")}
            </a>
            <p>{t("explore_" + key)}</p>
          </li>
        ))}
      </ul>

      <h2>{t("home_tools")}</h2>
      <ul class="index">
        {TOOLS.map(([href, key]) => (
          <li>
            <a class="entry" href={href}>
              {t(key)}
            </a>
            <p>{t("explore_" + key)}</p>
          </li>
        ))}
      </ul>

      <h2>{t("home_how_to_use")}</h2>
      <ol class="steps">
        <li>{t("home_how_to_step1")}</li>
        <li>{t("home_how_to_step2")}</li>
        <li>{t("home_how_to_step3")}</li>
      </ol>
      <div class="actions">
        <a class="button" href="/documentation" target="_blank">
          {t("home_full_documentation")}
        </a>
        <a class="button" href="/catalog">
          {t("nav_catalog")}
        </a>
      </div>
    </Layout>
  )
}
