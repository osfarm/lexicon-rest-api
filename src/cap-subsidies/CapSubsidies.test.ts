import { describe, expect, test } from "bun:test"
import { subsidiesByYear } from "./CapSubsidies"

describe("subsidiesByYear", () => {
  test("the years are kept apart, latest first", () => {
    expect(
      subsidiesByYear([
        { year: 2024, feaga_amount: "100.10", feader_amount: "0.00" },
        { year: 2025, feaga_amount: "50.00", cofinanced_amount: "0.05" },
        { year: 2024, feader_amount: "200.20", cofinanced_amount: "10.00" },
      ]),
    ).toEqual([
      { year: 2025, count: 1, total: 50.05 },
      { year: 2024, count: 2, total: 310.3 },
    ])
  })

  test("empty or missing amounts count for nothing", () => {
    expect(
      subsidiesByYear([
        { year: 2025, feaga_amount: "", feader_amount: null },
        { year: 2025 },
      ]),
    ).toEqual([{ year: 2025, count: 2, total: 0 }])
    expect(subsidiesByYear([])).toEqual([])
  })

  test("many small amounts add up without drift", () => {
    const subsidies = Array.from({ length: 1000 }, () => ({
      year: 2025,
      feaga_amount: "0.10",
    }))

    expect(subsidiesByYear(subsidies)[0].total).toBe(100)
  })
})
