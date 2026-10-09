import { describe, expect, test } from "bun:test"
import { inputPriceOf, priceQueryOf, type InputPriceRow } from "./InputPrices"

const NOW = new Date("2026-10-07T12:00:00Z")

const row = (changes: Partial<InputPriceRow> = {}): InputPriceRow => ({
  kind: "phytosanitary",
  id: "2000003",
  name: "SULTAN",
  detail: "Metazachlor 500.0 g/L",
  amount: "18.0000",
  packaging: "liter_bulk",
  started_on: new Date("2026-10-01T00:00:00Z"),
  method: "observed",
  source: "phytosanitary_prices",
  negotiated: true,
  ...changes,
})

describe("priceQueryOf", () => {
  test("keeps the words asked and a quantity above zero", () => {
    expect(priceQueryOf({ query: " glyphosate ", quantity: "3" })).toEqual({
      query: "glyphosate",
      quantity: 3,
      limit: 10,
    })
  })

  test("refuses a query too short to mean anything", () => {
    expect(priceQueryOf({ query: "a" })).toBeUndefined()
    expect(priceQueryOf({})).toBeUndefined()
  })

  test("ignores a quantity that is not one, and bounds the limit", () => {
    expect(priceQueryOf({ query: "urée", quantity: -2, limit: 500 })).toEqual({
      query: "urée",
      quantity: undefined,
      limit: 20,
    })
    expect(
      priceQueryOf({ query: "urée", quantity: "beaucoup" })?.quantity,
    ).toBeUndefined()
  })
})

describe("inputPriceOf", () => {
  test("gives the price, its unit, its date and where it comes from", () => {
    expect(inputPriceOf(row(), NOW)).toEqual({
      kind: "phytosanitary",
      id: "2000003",
      name: "SULTAN",
      detail: "Metazachlor 500.0 g/L",
      price: 18,
      currency: "EUR",
      unit: "liter",
      "price-date": "2026-10-01",
      method: "observed",
      source: "phytosanitary_prices",
      negotiated: true,
      stale: false,
    })
  })

  test("costs the quantity asked", () => {
    expect(inputPriceOf(row({ amount: "17.01" }), NOW, 3).cost).toBe(51.03)
  })

  test("says when a price is old", () => {
    const old = inputPriceOf(row({ started_on: "2020-01-01", method: null }), NOW)

    expect(old.stale).toBe(true)
    expect(old.method).toBe("reference")
    expect(old["price-date"]).toBe("2020-01-01")
  })

  test("names the kind of an article by its category", () => {
    expect(
      inputPriceOf(row({ kind: "fertilizer", packaging: "ton_bulk" }), NOW),
    ).toMatchObject({
      kind: "fertilizer",
      unit: "ton",
    })
    expect(inputPriceOf(row({ kind: "seed_and_plant" }), NOW).kind).toBe("seed")
    expect(
      inputPriceOf(row({ kind: "animal_food", packaging: "50tg_bag" }), NOW),
    ).toMatchObject({
      kind: "other",
      unit: "50tg_bag",
    })
  })

  test("a price with no known origin is not a negotiated one", () => {
    expect(inputPriceOf(row({ negotiated: null, source: null }), NOW)).toMatchObject({
      negotiated: false,
    })
    expect(inputPriceOf(row({ source: null }), NOW)).not.toHaveProperty("source")
  })
})
