import { describe, expect, test } from "bun:test"
import { substanceQueryOf } from "./Purchases"

describe("substanceQueryOf", () => {
  test("a name is compared without capitals nor accents, as the source writes it", () => {
    expect(substanceQueryOf({ substance: " Diméthénamide-P " })?.substance).toBe(
      "dimethenamide p",
    )
  })

  test("a year is kept when it is one", () => {
    expect(substanceQueryOf({ substance: "soufre", year: 2022 })?.year).toBe(2022)
    expect(substanceQueryOf({ substance: "soufre", year: "2022" })?.year).toBe(2022)
    expect(substanceQueryOf({ substance: "soufre", year: "last" })?.year).toBeUndefined()
  })

  test("nothing to look for without a substance", () => {
    expect(substanceQueryOf({})).toBeUndefined()
    expect(substanceQueryOf({ substance: "  " })).toBeUndefined()
  })
})
