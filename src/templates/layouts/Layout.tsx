import { Html } from "@elysiajs/html"
import { Breadcrumbs } from "../components/Breadcrumbs"
import { Hypermedia, type HypermediaType } from "../../Hypermedia"
import type { Translator } from "../../Translator"
import packageJson from "../../../package.json"
import { asset } from "../Assets"

export type SiteSection = "home" | "explore" | "catalog" | "tools" | "documentation"

type Props = {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  t: Translator
  children: any
  // The entry of the menu the page belongs to, when the breadcrumbs do not tell
  section?: SiteSection
  // A page that brings its own heading, such as the home page
  bare?: boolean
}

/**
 * The entry of the menu a page belongs to, told by where its breadcrumbs go through.
 */
export function sectionOf(breadcrumbs: { href: string }[]): SiteSection {
  if (breadcrumbs.length === 0) {
    return "home"
  }
  if (breadcrumbs.some((link) => link.href.startsWith("/catalog"))) {
    return "catalog"
  }
  if (breadcrumbs.some((link) => link.href.startsWith("/tools"))) {
    return "tools"
  }

  return "explore"
}

/**
 * The breadcrumbs as shown: the pages of data are reached through "Explore".
 */
export function shownBreadcrumbs(
  breadcrumbs: HypermediaType["Link"][],
  section: SiteSection,
  exploreLabel: string,
): HypermediaType["Link"][] {
  const [home, ...rest] = breadcrumbs

  return section !== "explore" ||
    home === undefined ||
    rest.some((link) => link.href === "/explore")
    ? breadcrumbs
    : [
        home,
        Hypermedia.Link({ value: exploreLabel, method: "GET", href: "/explore" }),
        ...rest,
      ]
}

const MENU: [SiteSection, string, string][] = [
  ["home", "/", "home_title"],
  ["explore", "/explore", "nav_explore"],
  ["catalog", "/catalog", "nav_catalog"],
  ["tools", "/tools", "tools"],
  ["documentation", "/documentation", "documentation_title"],
]

const LANGUAGES = ["fr", "en"] as const

export function Layout(props: Props) {
  const { t } = props
  const language = t.language === "en" ? "en" : "fr"
  const section = props.section ?? sectionOf(props.breadcrumbs)
  // The page of the index itself is not preceded by its own entry
  const breadcrumbs =
    props.title === t("nav_explore")
      ? props.breadcrumbs
      : shownBreadcrumbs(props.breadcrumbs, section, t("nav_explore"))

  return (
    <html lang={language}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href={asset("style.css")} />
        <link rel="icon" type="image/svg+xml" href="/public/images/lexicon-mark.svg" />
        <link
          rel="alternate icon"
          type="image/x-icon"
          href="/public/images/favicon.ico"
        />

        <title>{props.title} — Lexicon</title>

        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossorigin=""
        />
      </head>

      <body>
        <a class="skip-link" href="#content">
          {t("nav_skip")}
        </a>

        <header class="site-header">
          <div class="site-header-inner">
            <a class="brand" href="/">
              <img src="/public/images/lexicon-mark.svg" alt="" width="40" height="40" />
              lexicon
            </a>

            {/* Folded on a phone, without any script: a checkbox opens it */}
            <input type="checkbox" id="menu-toggle" class="menu-toggle" />
            <label for="menu-toggle" class="menu-button">
              {t("nav_menu")}
            </label>
            <nav class="site-nav" aria-label={t("nav_menu")}>
              {MENU.map(([entry, href, label]) => (
                <a
                  href={href}
                  aria-current={entry === section ? "page" : undefined}
                  target={entry === "documentation" ? "_blank" : undefined}
                >
                  {t(label)}
                </a>
              ))}
            </nav>

            <div class="language" role="group" aria-label={t("nav_language")}>
              {LANGUAGES.map((code) => (
                <a
                  href={`/language/${code}`}
                  hreflang={code}
                  aria-current={code === language ? "true" : undefined}
                >
                  {code.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        </header>

        <main class="page" id="content">
          {props.bare ? (
            ""
          ) : (
            <div>
              <Breadcrumbs pageTitle={props.title} links={breadcrumbs} />
              <h1>{props.title}</h1>
            </div>
          )}

          {props.children}
        </main>

        <footer class="site-footer">
          <div class="site-footer-inner">
            <div>
              <h2>Lexicon</h2>
              <ul>
                <li>
                  <a href="/explore">{t("nav_explore")}</a>
                </li>
                <li>
                  <a href="/catalog">{t("nav_catalog")}</a>
                </li>
                <li>
                  <a href="/documentation" target="_blank">
                    {t("documentation_title")}
                  </a>
                </li>
                <li>
                  <a href="/credits">{t("footer_credits")}</a>
                </li>
              </ul>
            </div>
            <div>
              <h2>{t("footer_association")}</h2>
              <ul>
                <li>
                  <a href="https://www.osfarm.org/">osfarm.org</a>
                </li>
                <li>
                  <a href="https://github.com/osfarm/lexicon-rest-api">GitHub</a>
                </li>
              </ul>
            </div>
            <div>
              <h2>{t("footer_version")}</h2>
              <ul>
                <li>Lexicon {packageJson.version}</li>
                <li>{t("footer_licence")}</li>
              </ul>
            </div>
            <a class="osfarm" href="https://www.osfarm.org/">
              <img src="/public/images/osfarm-logo.jpg" alt="OSFarm" height="56" />
            </a>
          </div>
        </footer>

        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <script src="//unpkg.com/alpinejs" defer></script>

        <script
          src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
          crossorigin=""
        ></script>

        <script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"></script>
      </body>
    </html>
  )
}
