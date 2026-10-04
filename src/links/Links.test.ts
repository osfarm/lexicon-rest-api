import { describe, expect, test } from "bun:test"
import {
  capYearOf,
  communeLinkOf,
  enterpriseLinkOf,
  isInseeCode,
  isSiren,
  readCapYears,
} from "./Links"

describe("communeLinkOf", () => {
  const row = {
    insee_code: "17387",
    name: "ST PORCHAIRE",
    postal_codes: ["17250"],
    department_code: "17",
    region_code: "75",
    cadastral_parcels_count: 4386,
    cadastral_area_m2: "16373913",
    agricultural_owner_parcels_count: 16,
    enterprises_count: 41,
    msa_year: 2019,
    msa_farm_chiefs: 10,
    weather_station: "FR17415003",
  }

  test("groups what the datasets know about a commune", () => {
    const link = communeLinkOf(row)

    expect(link["insee-code"]).toBe("17387")
    expect(link.cadastre).toEqual({
      parcels: 4386,
      "area-m2": 16373913,
      "parcels-with-agricultural-owner": 16,
    })
    expect(link["agricultural-enterprises"]).toBe(41)
    expect(link.msa).toEqual({ year: 2019, "farm-chiefs": 10 })
    expect(link.links["weather-station"]).toBe("/weather/stations/FR17415003")
  })

  test("what is unknown stays null instead of being invented", () => {
    const link = communeLinkOf({ ...row, msa_year: null, weather_station: null })

    expect(link.msa).toBeNull()
    expect(link["weather-station"]).toBeNull()
    expect(link.links).toEqual({})
  })
})

describe("enterpriseLinkOf", () => {
  const row = {
    siren: "662043116",
    name: "OFFICE NATIONAL DES FORETS",
    legal_form: "EPIC",
    owned_parcels_count: 226556,
    owned_area_m2: "58513174802",
    owned_communes_count: 4433,
    establishments_count: 239,
    main_activity_code: "02.10Z",
    cap_year: 2024,
    cap_total: "6573149.71",
  }

  test("groups cadastre, establishments and CAP payments of a company", () => {
    const link = enterpriseLinkOf(row)

    expect(link.cadastre).toEqual({
      parcels: 226556,
      "area-m2": 58513174802,
      communes: 4433,
    })
    expect(link.establishments).toEqual({ count: 239, "main-activity-code": "02.10Z" })
    expect(link.cap).toEqual({ year: 2024, total: 6573149.71 })
    expect(link.links.enterprise).toBe("/enterprises/enterprises/662043116")
  })

  test("the CAP payments are given year by year, never added up", () => {
    const years = [
      {
        year: 2025,
        feaga_total: "100.00",
        feader_total: "20.50",
        cofinanced_total: "4.50",
        total_eu_cofinanced: "125.00",
      },
      {
        year: 2024,
        feaga_total: "90.00",
        feader_total: null,
        cofinanced_total: null,
        total_eu_cofinanced: "90.00",
      },
    ].map(capYearOf)
    const link = enterpriseLinkOf(row, years)

    expect(link["cap-by-year"]).toEqual([
      { year: 2025, feaga: 100, feader: 20.5, cofinanced: 4.5, total: 125 },
      { year: 2024, feaga: 90, feader: 0, cofinanced: 0, total: 90 },
    ])
    expect(enterpriseLinkOf(row)["cap-by-year"]).toEqual([])
  })

  test("beneficiaries that are not in service give no year, not an error", async () => {
    const db = {
      query: async () => {
        throw new Error("relation does not exist")
      },
    }

    expect(await readCapYears(db as any, "662043116")).toEqual([])
  })

  test("a company without agricultural establishment nor CAP payment", () => {
    const link = enterpriseLinkOf({ ...row, establishments_count: 0, cap_year: null })

    expect(link.cap).toBeNull()
    expect(link.links).toEqual({})
  })
})

describe("identifiers", () => {
  test("INSEE codes include Corsica and overseas departments", () => {
    expect(["17387", "2A004", "2B033", "97209"].every(isInseeCode)).toBe(true)
    expect(["1738", "173870", "ABCDE", "17387'"].some(isInseeCode)).toBe(false)
  })

  test("a SIREN is nine digits", () => {
    expect(isSiren("662043116")).toBe(true)
    expect(["66204311", "6620431160", "66204311A"].some(isSiren)).toBe(false)
  })
})
