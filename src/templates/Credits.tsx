import { Hypermedia } from "../Hypermedia"
import type { Translator } from "../Translator"
import { Layout } from "./Layout"
import { html, Html } from "@elysiajs/html"

interface Props {
  t: Translator
}

export function Credits(props: Props) {
  const { t } = props

  const CREDITS = [
    { label: t("credits_production"), credited: ["OSFarm"] },
    {
      label: t("credits_data_providers"),
      credited: [
        "ANSES",
        "Ekylibre",
        "EU",
        "IGN",
        "INRAE",
        "La Poste",
        "Météo France",
      ],
    },
    {
      label: t("credits_open_source_softwares"),
      credited: ["Bun", "ElysiaJS", "PostgreSQL", "Ruby"],
    },
  ]
  return (
    <Layout
      title={t("credits_title")}
      breadcrumbs={[
        Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
      ]}
    >
      {CREDITS.map((credit) => (
        <ul>
          <li>
            <b>{credit.label}</b>
            <ul>
              {credit.credited.map((credited) => (
                <li>{credited}</li>
              ))}
            </ul>
          </li>
        </ul>
      ))}
    </Layout>
  )
}
