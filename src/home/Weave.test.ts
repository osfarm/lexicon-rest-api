import { describe, expect, test } from "bun:test"
import { DATASETS, figuresOf, JOURNEY, KEYS, roundedCount, threadOf } from "./Weave"

const names = new Set(DATASETS.map((dataset) => dataset.name))

describe("the weave", () => {
  test("every key is carried by at least two datasets of the picture", () => {
    KEYS.forEach((key) => {
      expect(key.carriedBy.length).toBeGreaterThanOrEqual(2)
      key.carriedBy.forEach((name) => expect(names.has(name)).toBe(true))
    })
  })

  test("every dataset carries at least one key", () => {
    DATASETS.forEach((dataset) =>
      expect(KEYS.some((key) => key.carriedBy.includes(dataset.name))).toBe(true),
    )
  })

  test("datasets of a family stand side by side", () => {
    const families = DATASETS.map((dataset) => dataset.family)
    const runs = families.filter((family, index) => family !== families[index - 1])

    expect(new Set(runs).size).toBe(runs.length)
  })

  test("a step of the journey only names what the picture shows", () => {
    const keys = new Set(KEYS.map((key) => key.id))

    JOURNEY.forEach((step) => {
      step.datasets.forEach((name) => expect(names.has(name)).toBe(true))
      step.keys.forEach((id) => expect(keys.has(id)).toBe(true))
    })
  })

  test("a thread runs from its first knot to its last", () => {
    const siren = KEYS.find((key) => key.id === "siren")!
    const { first, last } = threadOf(siren)

    expect(DATASETS[first].name).toBe("cadastre_owners")
    expect(DATASETS[last].name).toBe("cap_beneficiaries")
  })
})

describe("figures", () => {
  test("come from the catalogue, for the datasets of the picture only", () => {
    const figures = figuresOf([
      { name: "cadastre", rows: 93487746, scope: "open" },
      { name: "cadastre_owners", rows: 46582299, scope: "members" },
      { name: "units", rows: 120, scope: "open" },
    ])

    expect(figures.get("cadastre")).toEqual({ rows: 93487746, reserved: false })
    expect(figures.get("cadastre_owners")?.reserved).toBe(true)
    expect(figures.has("units")).toBe(false)
  })

  test("a missing catalogue gives no figure, not an error", () => {
    expect(figuresOf(undefined).size).toBe(0)
  })

  test("counts are rounded for the eye", () => {
    expect(roundedCount(93487746, "fr")).toBe("93 M")
    expect(roundedCount(1341069, "fr")).toBe("1,3 M")
    expect(roundedCount(1341069, "en")).toBe("1.3 M")
    expect(roundedCount(49756, "fr")).toBe("50 k")
    expect(roundedCount(416, "fr")).toBe("416")
  })
})
