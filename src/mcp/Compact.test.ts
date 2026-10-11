import { describe, expect, test } from "bun:test"
import { compact, compactPage } from "./Compact"
import { parcelSummaryOf } from "./Parcel"
import example from "../assets/examples/parcel-identifier-saint-porchaire.json"

describe("compact", () => {
  test("a cell is its value, with its unit when it has one", () => {
    expect(compact({ "@type": "Number", label: "Profondeur", value: 30, unit: "cm" })).toBe(
      "30 cm",
    )
    expect(compact({ "@type": "Text", label: "Nom", value: "Blé" })).toBe("Blé")
    expect(compact({ "@type": "Number", label: "Applications", value: 2 })).toBe(2)
  })

  test("a date is its day, a list its items, a missing value null", () => {
    expect(
      compact({ "@type": "Date", value: "10/10/2026", iso: "2026-10-10T03:00:00.000Z" }),
    ).toBe("2026-10-10")
    expect(compact({ "@type": "List", label: "Substances", values: ["a", "b"] })).toEqual([
      "a",
      "b",
    ])
    expect(compact({ "@type": "Undefined", label: "Dose", value: "Non renseigné" })).toBeNull()
  })
})

describe("compactPage", () => {
  const page = {
    "@id": "http://localhost/phytosanitary/usages.json",
    title: "Usages autorisés",
    breadcrumbs: [{ "@type": "Link", value: "Accueil", href: "/" }],
    form: { crop: { "@type": "Text", label: "Culture" }, state: { "@type": "Select" } },
    table: {
      columns: { product: "Produit", dose: "Dose" },
      rows: [
        {
          product: { "@type": "Text", label: "Produit", value: "DEFI" },
          dose: { "@type": "Number", label: "Dose", value: 5, unit: "L/ha" },
        },
        { product: { "@type": "Text", label: "Produit", value: "ROXY" } },
      ],
    },
    "items-total": 1018,
    "total-pages": 7,
    page: 1,
    navigation: {},
    formats: {},
  }

  test("a table says its size and its filters first, then one array per row", () => {
    expect(compactPage(page)).toEqual({
      title: "Usages autorisés",
      "rows-total": 1018,
      page: 1,
      "pages-total": 7,
      filters: ["crop", "state"],
      columns: ["Produit", "Dose"],
      rows: [
        ["DEFI", "5 L/ha"],
        ["ROXY", null],
      ],
    })
  })

  test("the size comes before the rows, so that a cut result still tells it", () => {
    const text = JSON.stringify(compactPage(page))

    expect(text.indexOf("rows-total")).toBeLessThan(text.indexOf('"rows"'))
  })

  test("a record keeps its sections without the chrome of the page", () => {
    expect(
      compactPage({
        title: "Station",
        breadcrumbs: [],
        name: { "@type": "Text", label: "Nom", value: "SAINTES" },
      }),
    ).toEqual({ title: "Station", name: "SAINTES" })
  })
})

describe("parcelSummaryOf", () => {
  const summary = parcelSummaryOf(example) as Record<string, any>

  test("names the parcel, its crop and its rotation in plain values", () => {
    expect(summary["cadastral-parcel"].section).toBe("ZA")
    expect(summary["crop-rotation"].at(-1)).toMatchObject({ campaign: 2025, current: true })
    expect(summary.soil.depth).toBe("30 cm")
  })

  test("turns lists and charts into figures", () => {
    expect(summary.farms["agricultural-establishments"]).toBeGreaterThan(0)
    expect(summary["weather-last-30-days"]["days-reported"]).toBeGreaterThan(0)
    expect(summary["department-yields"]["by-campaign"]).toBeDefined()
  })

  test("is short enough to be read in one go", () => {
    expect(JSON.stringify(summary).length).toBeLessThan(6000)
  })

  test("a point nothing is known at gives the point alone", () => {
    expect(Object.keys(parcelSummaryOf({ point: { latitude: 0, longitude: 0 } }))).toEqual([
      "point",
      "zonings",
    ])
  })
})
