import { describe, expect, test } from "bun:test"
import { languageOf } from "./applyRequestConfiguration"
import { publicFileOf } from "./API"
import { returnPath } from "./Language"
import { sectionOf, shownBreadcrumbs } from "./templates/layouts/Layout"

describe("languageOf", () => {
  test("the choice of the visitor comes first", () => {
    expect(
      languageOf({ cookie: "a=b; lang=en", acceptLanguage: "fr-FR", isPage: true }),
    ).toBe("en")
    expect(
      languageOf({ cookie: "lang=fr", acceptLanguage: "en-US,en", isPage: false }),
    ).toBe("fr")
  })

  test("without a choice, a page is in French whatever the browser says", () => {
    expect(
      languageOf({ cookie: undefined, acceptLanguage: "en-US,en;q=0.9", isPage: true }),
    ).toBe("fr")
  })

  test("without a choice, data follows what the client asks for", () => {
    expect(
      languageOf({ cookie: undefined, acceptLanguage: "en-US,en;q=0.9", isPage: false }),
    ).toBe("en")
    expect(
      languageOf({ cookie: undefined, acceptLanguage: "de-DE", isPage: false }),
    ).toBe("fr")
    expect(
      languageOf({ cookie: undefined, acceptLanguage: undefined, isPage: false }),
    ).toBe("fr")
  })

  test("a cookie that is not a language is ignored", () => {
    expect(languageOf({ cookie: "lang=xx", acceptLanguage: "en", isPage: true })).toBe(
      "fr",
    )
  })
})

describe("returnPath", () => {
  test("goes back to the page of this site the visitor came from", () => {
    expect(
      returnPath("https://lexicon.osfarm.org/catalog?x=1", "lexicon.osfarm.org"),
    ).toBe("/catalog?x=1")
  })

  test("never leaves the site", () => {
    expect(returnPath("https://evil.example/phish", "lexicon.osfarm.org")).toBe("/")
    expect(returnPath(null, "lexicon.osfarm.org")).toBe("/")
    expect(returnPath("not a url", "lexicon.osfarm.org")).toBe("/")
  })
})

describe("menu and breadcrumbs", () => {
  const home = { "@type": "Link", value: "Accueil", method: "GET", href: "/" } as any
  const link = (href: string) => ({ ...home, value: href, href })

  test("the entry of the menu is told by the breadcrumbs", () => {
    expect(sectionOf([])).toBe("home")
    expect(sectionOf([home, link("/catalog")])).toBe("catalog")
    expect(sectionOf([home, link("/tools")])).toBe("tools")
    expect(sectionOf([home, link("/phytosanitary")])).toBe("explore")
    expect(sectionOf([home])).toBe("explore")
  })

  test("the pages of data are reached through Explore", () => {
    const shown = shownBreadcrumbs([home, link("/phytosanitary")], "explore", "Explorer")

    expect(shown.map((crumb) => crumb.href)).toEqual(["/", "/explore", "/phytosanitary"])
    expect(shownBreadcrumbs([home, link("/tools")], "tools", "Explorer")).toHaveLength(2)
    expect(shownBreadcrumbs([], "home", "Explorer")).toEqual([])
  })
})

describe("publicFileOf", () => {
  test("a file of the public folder is served", () => {
    expect(publicFileOf("/public/style.css")).toBe("public/style.css")
    expect(publicFileOf("/public/fonts/ubuntu-500-latin.woff2")).toBe(
      "public/fonts/ubuntu-500-latin.woff2",
    )
  })

  test("nothing outside the public folder is", () => {
    expect(publicFileOf("/.env")).toBeUndefined()
    expect(publicFileOf("/public/../.env")).toBeUndefined()
    expect(publicFileOf("/public/%2e%2e/.env")).toBeUndefined()
    expect(publicFileOf("/public/..%2f.env")).toBeUndefined()
    expect(publicFileOf("/public/%zz")).toBeUndefined()
  })
})
