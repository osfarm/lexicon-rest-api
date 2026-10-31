import { describe, expect, test } from "bun:test"
import { responseOf } from "./API"

const FEATURES = { type: "FeatureCollection", features: [] }

describe("responseOf", () => {
  test("a structured value is sent as GeoJSON on a .geojson address", async () => {
    const response = responseOf(FEATURES, "geojson")

    expect(response.headers.get("Content-Type")).toBe("application/geo+json")
    expect(await response.json()).toEqual(FEATURES)
  })

  test("a structured value is sent as JSON elsewhere", async () => {
    const response = responseOf({ items: [] }, "json")

    expect(response.headers.get("Content-Type")).toBe("application/json")
    expect(await response.text()).toBe('{"items":[]}')
  })

  test("a page stays a page and a response is kept as it is", async () => {
    const page = responseOf("<p>Lexicon</p>", "html")
    const ready = new Response("a,b", { headers: { "Content-Type": "text/csv" } })

    expect(page.headers.get("Content-Type")).toBe("text/html")
    expect(await page.text()).toBe("<p>Lexicon</p>")
    expect(responseOf(ready, "csv")).toBe(ready)
  })
})
