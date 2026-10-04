import { describe, expect, test } from "bun:test"
import { coordinatesOf, cropHistoryAt, cropOf } from "./CapHistory"

describe("coordinatesOf", () => {
  test("a point is two numbers on Earth", () => {
    expect(coordinatesOf({ longitude: "-0.78", latitude: "45.81" })).toEqual({
      longitude: -0.78,
      latitude: 45.81,
    })
    expect(coordinatesOf({ longitude: 0, latitude: 0 })).toEqual({
      longitude: 0,
      latitude: 0,
    })
  })

  test("anything else is no point", () => {
    expect(coordinatesOf({ longitude: "-0.78" })).toBeUndefined()
    expect(coordinatesOf({ longitude: "", latitude: "" })).toBeUndefined()
    expect(coordinatesOf({ longitude: "x", latitude: "45" })).toBeUndefined()
    expect(coordinatesOf({ longitude: "200", latitude: "45" })).toBeUndefined()
    expect(coordinatesOf({ longitude: "2", latitude: "95" })).toBeUndefined()
  })
})

describe("cropHistoryAt", () => {
  const row = {
    campaign: 2023,
    id: "19",
    cap_crop_code: "BTH",
    cap_label: "Blé tendre d'hiver",
    current: false,
  }

  test("the coordinates are bound, longitude first", async () => {
    const asked: { text: string; values: unknown[] }[] = []
    const db = {
      query: async (text: string, values: unknown[]) => {
        asked.push({ text, values })

        return { rows: [row] }
      },
    }

    expect(await cropHistoryAt(db as any, { longitude: -0.78, latitude: 45.81 })).toEqual(
      [cropOf(row)],
    )
    expect(asked[0].values).toEqual([-0.78, 45.81])
    expect(asked[0].text).toContain("registered_graphic_parcels_history")
    expect(asked[0].text).not.toContain("45.81")
  })

  test("without the history, the latest campaign alone is given", async () => {
    const db = {
      query: async (text: string) => {
        if (text.includes("_history")) throw new Error("relation does not exist")

        return { rows: [{ ...row, campaign: 2025, current: true }] }
      },
    }

    expect(await cropHistoryAt(db as any, { longitude: 1, latitude: 45 })).toMatchObject([
      { campaign: 2025, current: true },
    ])
  })

  test("parcels that are not in service give undefined", async () => {
    const db = {
      query: async () => {
        throw new Error("relation does not exist")
      },
    }

    expect(await cropHistoryAt(db as any, { longitude: 1, latitude: 45 })).toBeUndefined()
  })

  test("a crop keeps its code when it has no label", () => {
    expect(cropOf({ ...row, cap_label: null })).toMatchObject({
      "crop-code": "BTH",
      crop: null,
      "parcel-id": "19",
    })
  })
})
