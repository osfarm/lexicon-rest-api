import { describe, expect, test } from "bun:test"
import { capParcelsMapHref, citySearchSteps } from "./utils"

describe("citySearchSteps", () => {
  test("every exact spelling is tried before any partial one", () => {
    const steps = citySearchSteps("Beaufou")

    expect(steps[0]).toEqual({ operator: "=", value: "BEAUFOU" })
    const firstPartial = steps.findIndex((step) => step.operator === "LIKE")
    expect(steps.slice(0, firstPartial).every((step) => step.operator === "=")).toBe(true)
    expect(steps.slice(firstPartial).every((step) => step.operator === "LIKE")).toBe(true)
  })

  test("the abbreviated spelling of the table is among the exact ones", () => {
    const exact = citySearchSteps("Saint-Porchaire")
      .filter((step) => step.operator === "=")
      .map((step) => step.value)

    expect(exact).toContain("ST PORCHAIRE")
  })

  test("partial steps keep the wildcards around the name", () => {
    const partial = citySearchSteps("Beaufou").filter((step) => step.operator === "LIKE")

    expect(partial[0]).toEqual({ operator: "LIKE", value: "%BEAUFOU%" })
  })
})

describe("capParcelsMapHref", () => {
  const beaufou = { id: "85015_85170_BEAUFO_", city_name: "BEAUFOU" }

  test("the map is asked for by the identifier of the municipality", () => {
    const query = new URLSearchParams(capParcelsMapHref(beaufou).split("?")[1])

    expect(query.get("municipality")).toBe("85015_85170_BEAUFO_")
    expect(query.get("city")).toBe("BEAUFOU")
  })

  test("the extension goes before the query", () => {
    expect(capParcelsMapHref(beaufou, ".geojson")).toStartWith(
      "/geographical-references/cap-parcels/map.geojson?",
    )
  })
})
