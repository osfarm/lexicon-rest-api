import { Html } from "@elysiajs/html"
import { readCatalog } from "../../catalog/Catalog"
import { DATASETS, figuresOf, JOURNEY } from "../../home/Weave"
import type { Context } from "../../types/Context"
import { asset } from "../Assets"
import { Weave } from "../components/Weave"
import { Layout } from "../layouts/Layout"

const MCP_SETTINGS = `{ "mcpServers": { "lexicon": {
    "type": "http",
    "url": "https://lexicon.osfarm.org/mcp"
} } }`

export async function Home(cxt: Context) {
  const { t } = cxt
  const language = t.language === "en" ? "en" : "fr"
  const catalog = await readCatalog(cxt.db)

  return (
    <Layout title={t("home_title")} breadcrumbs={[]} t={t} section="home" bare>
      <div class="notice">
        <p>
          <img src="/public/icons/circle-info.svg" alt="" height={13} />{" "}
          {t("home_warning")}
        </p>
      </div>

      <div class="hero">
        <h1>{t("home_headline")}</h1>
        <p class="lead">{t("home_lead")}</p>
        <div class="actions">
          <a class="button primary" href="/explore">
            {t("home_action_explore")}
          </a>
          <a class="button" href="/tools/assistant">
            {t("home_action_ask")}
          </a>
        </div>
      </div>

      <Weave t={t} figures={figuresOf(catalog)} />

      <p class="prose">
        {catalog === undefined
          ? ""
          : t("home_weave_count")
              .replace("%shown", String(DATASETS.length))
              .replace("%total", String(catalog.length))}{" "}
        <a href="/catalog">{t("home_weave_catalog")}</a>
      </p>

      <h2>{t("home_journey_title")}</h2>
      <p class="prose">{t("home_journey_lead")}</p>
      <ol class="journey">
        {JOURNEY.map((step) => (
          <li
            data-step
            data-keys={step.keys.join(" ")}
            data-datasets={step.datasets.join(" ")}
            data-text={Html.escapeHtml(step.text[language])}
          >
            <p>{step.text[language]}</p>
            <a href={step.link.href}>{step.link.label[language]}</a>
          </li>
        ))}
      </ol>

      <h2>{t("home_ways_title")}</h2>
      <div class="columns">
        <div>
          <h3>{t("home_way_api_title")}</h3>
          <p>{t("home_way_api")}</p>
          <pre>
            <code>curl https://lexicon.osfarm.org/phytosanitary/products.json</code>
          </pre>
          <a href="/documentation" target="_blank">
            {t("home_full_documentation")}
          </a>
        </div>
        <div>
          <h3>{t("home_way_packages_title")}</h3>
          <p>{t("home_way_packages")}</p>
          <a href="/catalog">{t("home_way_packages_link")}</a>
        </div>
        <div>
          <h3>{t("home_way_agents_title")}</h3>
          <p>{t("home_way_agents")}</p>
          <pre>
            <code>{Html.escapeHtml(MCP_SETTINGS)}</code>
          </pre>
          <a href="/tools/assistant">{t("home_action_ask")}</a>
        </div>
      </div>

      <div class="commons">
        <h2>{t("home_commons_title")}</h2>
        <p>{t("home_commons")}</p>
        <div class="actions">
          <a class="button" href="https://www.osfarm.org/">
            {t("home_commons_join")}
          </a>
          <a class="button" href="https://github.com/osfarm/lexicon">
            {t("home_commons_contribute")}
          </a>
        </div>
      </div>

      <script src={asset("weave.js")} defer></script>
    </Layout>
  )
}
