import { describe, expect, test } from "bun:test"
import { Hypermedia } from "../Hypermedia"
import { veiled, veiledCell } from "./Preview"

describe("veiled", () => {
  test("a text keeps its first two characters", () => {
    expect(veiled("Cereapro")?.start).toBe("Ce")
  })

  test("nothing of the rest is kept", () => {
    expect(JSON.stringify(veiled("Cereapro"))).not.toContain("reapro")
  })

  test("a figure is veiled whole, whether a number or written as text", () => {
    expect(veiled(452.5)?.start).toBe("")
    expect(veiled("452,50 €")?.start).toBe("")
    expect(veiled("2026-10-10")?.start).toBe("")
  })

  test("an empty value has nothing to veil", () => {
    expect(veiled(undefined)).toBeUndefined()
    expect(veiled("")).toBeUndefined()
  })
})

describe("veiledCell", () => {
  test("the label of a link is started and its address dropped", () => {
    const cell = veiledCell(
      Hypermedia.Link({ value: "Ammonitrate 33,5", method: "GET", href: "/inputs/fertilizers/42" }),
    )

    expect(cell?.start).toBe("Am")
    expect(JSON.stringify(cell)).not.toContain("/inputs")
  })

  test("a number is veiled whole", () => {
    expect(veiledCell(Hypermedia.Number({ label: "Prix", value: 452, unit: "€/t" }))?.start).toBe("")
  })

  test("a date is veiled whole", () => {
    expect(
      veiledCell(Hypermedia.Date({ label: "Relevé", value: "10/10/2026", iso: "2026-10-10" }))?.start,
    ).toBe("")
  })
})
