import { describe, expect, test } from "bun:test"
import { figuresQueryOf, fold, productionsNamed } from "./CropFigures"
import { productQueryOf } from "../phytosanitary/ProductSearch"
import { grossProductOf } from "../parcel-context/ParcelContext"
import { shortened } from "../assistant/Conversation"

const PRODUCTIONS = [
  { reference: "winter_common_wheat", specie: "triticum_aestivum", fra: "Blé tendre d’hiver", eng: "Winter common wheat" },
  { reference: "spring_common_wheat", specie: "triticum_aestivum", fra: "Blé tendre de printemps", eng: "Spring common wheat" },
  { reference: "hard_wheat", specie: "triticum_durum", fra: "Blé dur", eng: "Hard wheat" },
  { reference: "sunflower", specie: "helianthus_annuus", fra: "Tournesol", eng: "Sunflower" },
]

describe("productionsNamed", () => {
  test("accents and capitals do not matter", () => {
    expect(fold("Blé tendre d’hiver")).toBe("ble tendre d hiver")
    expect(productionsNamed(PRODUCTIONS, "BLE TENDRE").map((p) => p.reference)).toEqual([
      "winter_common_wheat",
      "spring_common_wheat",
    ])
  })

  test("a name in English or a reference name is found too", () => {
    expect(productionsNamed(PRODUCTIONS, "sunflower")[0].reference).toBe("sunflower")
    expect(productionsNamed(PRODUCTIONS, "winter_common_wheat")).toHaveLength(1)
  })

  test("the shortest name comes first, and an unknown crop gives nothing", () => {
    expect(productionsNamed(PRODUCTIONS, "blé")[0].reference).toBe("hard_wheat")
    expect(productionsNamed(PRODUCTIONS, "quinoa")).toEqual([])
  })
})

describe("figuresQueryOf", () => {
  test("a department is a code, padded when it is a number", () => {
    expect(figuresQueryOf({ production: "blé", department: 1 })).toEqual({
      production: "blé",
      department: "01",
    })
    expect(figuresQueryOf({ production: "blé", department: "2a" })?.department).toBe("2A")
    expect(figuresQueryOf({ production: "blé", department: "Charente" })?.department).toBeUndefined()
  })

  test("a production is needed", () => {
    expect(figuresQueryOf({ department: "17" })).toBeUndefined()
  })
})

describe("productQueryOf", () => {
  test("needs something to search for, and bounds the number of products", () => {
    expect(productQueryOf({ limit: 5 })).toBeUndefined()
    expect(productQueryOf({ substance: " prosulfocarbe ", limit: 500 })).toMatchObject({
      substance: "prosulfocarbe",
      limit: 20,
    })
    expect(productQueryOf({ crop: "Blé" })?.limit).toBe(10)
  })
})

describe("grossProductOf", () => {
  test("quintals per hectare sold by the ton give euros per hectare", () => {
    expect(
      grossProductOf({ value: 74, unit: "quintal_per_hectare" }, { value: 251.25, unit: "ton" }),
    ).toBe(1859)
  })

  test("other units give nothing rather than a wrong figure", () => {
    expect(
      grossProductOf({ value: 74, unit: "quintal_per_hectare" }, { value: 90, unit: "cubic_meter" }),
    ).toBeUndefined()
    expect(grossProductOf(undefined, { value: 250, unit: "ton" })).toBeUndefined()
  })
})

describe("shortened", () => {
  test("a short result is given whole", () => {
    expect(shortened("abc", 10)).toBe("abc")
  })

  test("a cut result says it is not the whole", () => {
    const cut = shortened("x".repeat(50), 10)

    expect(cut.startsWith("x".repeat(10) + "\n")).toBe(true)
    expect(cut).toContain("40 more characters")
    expect(cut).toContain("NOT the whole result")
  })
})
