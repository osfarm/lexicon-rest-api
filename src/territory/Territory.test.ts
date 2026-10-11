import { describe, expect, test } from "bun:test"
import {
  canteensOf,
  hveBySiren,
  hveOf,
  organicOf,
  qualitySignsOf,
  qualityZonesAt,
  schoolsOf,
  territoryOf,
} from "./Territory"
import { findSchools } from "./Trainings"

// A database that answers each query by the table it reads; a table that is not
// listed is not in service
type Answers = Record<string, (sql: string, values: unknown[]) => unknown[]>

const asked: { sql: string; values: unknown[] }[] = []

const database = (answers: Answers) => ({
  query: async (sql: string, values: unknown[] = []) => {
    asked.push({ sql, values })

    const table = Object.keys(answers).find((name) => sql.includes(`.${name}`))

    if (table === undefined) {
      throw new Error("relation does not exist")
    }

    return { rows: answers[table](sql, values) }
  },
}) as never

const farm = {
  name: "EARL DES VIGNES",
  siret: "12345678900011",
  siren: "123456789",
  animal_activity: null,
  plant_activity: "Viticulture",
  direct_sales: true,
  certified_on: "2024-05-03",
  website: null,
}

describe("quality signs of a commune", () => {
  test("count the areas of each sign and say which come by a former commune", async () => {
    const signs = await qualitySignsOf(
      database({
        registered_quality_and_origin_sign_communes: () => [
          { id: 1, name: "Cognac ", sign: "AOC", family: "spirits", partial: false, former_communes: [], products: ["Cognac"] },
          { id: 2, name: "Atlantique", sign: "IGP", family: "wine", partial: true, former_communes: ["17001"], products: [] },
          { id: 3, name: "Charentais", sign: "IGP", family: "wine", partial: false, former_communes: [], products: [] },
        ],
      }),
      "17387",
    )

    expect(signs?.count).toEqual({ AOC: 1, IGP: 2 })
    expect(signs?.areas[0].name).toBe("Cognac")
    expect(signs?.areas[0]["former-communes"]).toBeUndefined()
    expect(signs?.areas[1]).toMatchObject({ partial: true, "former-communes": ["17001"] })
  })

  test("are unknown when the package is not in service", async () => {
    expect(await qualitySignsOf(database({}), "17387")).toBeUndefined()
  })

  test("a zone names its denomination only when it is one inside an appellation", async () => {
    const zones = await qualityZonesAt(
      database({
        registered_quality_and_origin_sign_zones: () => [
          { appellation: "Bordeaux", denomination: "Bordeaux", complementary: false, categories: "Vin tranquille" },
          { appellation: "Bourgogne", denomination: "Côte d'Or", complementary: true, categories: null },
        ],
      }),
      { longitude: -0.18, latitude: 44.89 },
    )

    expect(zones).toEqual([
      { appellation: "Bordeaux", denomination: undefined, categories: "Vin tranquille" },
      { appellation: "Bourgogne", denomination: "Côte d'Or", categories: undefined },
    ])
  })
})

describe("organic farming of a commune", () => {
  const answers: Answers = {
    registered_organic_operators: (sql) =>
      sql.includes("main_production")
        ? [{ production: "Viticulture", operators: "2" }]
        : [
            { kind: "P", operators: "2" },
            { kind: "T", operators: "1" },
          ],
    registered_organic_areas: (sql) =>
      sql.includes("max(year)")
        ? [{ year: 2025 }]
        : [
            { year: 2024, farms_count: 3, masked: false, organic_area: "41.2567", conversion_area: "3.1" },
            { year: 2025, farms_count: 2, masked: true, organic_area: null, conversion_area: null },
          ],
    registered_organic_livestock: () => [],
    registered_organic_communes: () => [
      { epci_code: "241700517", epci_name: "CC Cœur de Saintonge", year: 2025, farms_count: 21, organic_area: "1286.3133", conversion_area: "87.16" },
    ],
    registered_organic_epci_livestock: () => [
      { group_name: "Vaches allaitantes", production: "Vaches allaitantes", farms_count: 5, organic_heads: 301 },
      { group_name: "Truies", production: "Truies", farms_count: 1, organic_heads: null },
    ],
  }

  test("a secret year keeps its farms and loses its area", async () => {
    const organic = await organicOf(database(answers), "17387")

    expect(organic?.operators).toEqual({ producers: 2, processors: 1, distributors: 0, importers: 0 })
    expect(organic?.years[0]).toEqual({ year: 2024, farms: 3, area: 41.3, "conversion-area": 3.1, masked: false })
    expect(organic?.years[1]).toEqual({ year: 2025, farms: 2, area: undefined, "conversion-area": undefined, masked: true })
  })

  test("the intercommunality gives the order of magnitude", async () => {
    const organic = await organicOf(database(answers), "17387")

    expect(organic?.epci).toMatchObject({ name: "CC Cœur de Saintonge", farms: 21, area: 1286.3 })
    expect(organic?.epci?.livestock[1].heads).toBeUndefined()
  })
})

describe("farms certified HVE", () => {
  const answers: Answers = { registered_hve_farms: () => [farm] }

  test("are counted for anyone and named for the holder of a key", async () => {
    const open = await hveOf(database(answers), "33394", false)
    const member = await hveOf(database(answers), "33394", true)

    expect(open?.farms).toBe(1)
    expect(open?.list).toBeUndefined()
    expect(member?.list?.[0]).toMatchObject({ name: "EARL DES VIGNES", "direct-sales": true, "certified-on": "2024-05-03" })
  })

  test("are found among owners by SIREN, and nothing is asked without one", async () => {
    asked.length = 0
    expect((await hveBySiren(database(answers), ["", "abc"])).size).toBe(0)
    expect(asked).toHaveLength(0)

    const found = await hveBySiren(database(answers), ["123456789", "123456789"])

    expect(found.get("123456789")?.name).toBe("EARL DES VIGNES")
    expect(asked[0].values).toEqual([["123456789"]])
  })
})

describe("canteens of a commune", () => {
  test("give shares in percent and the declarations of the last year", async () => {
    const canteens = await canteensOf(
      database({
        registered_canteens: () => [{ canteens: "3", meals: "318" }],
        registered_canteen_communes: () => [
          {
            year: 2024,
            declarations_count: 2,
            central_declarations_count: 0,
            meeting_targets_count: 1,
            lowest_organic_share: "0.1020",
            median_organic_share: "0.2424",
            highest_organic_share: "0.3828",
            median_quality_share: "0.1555",
            weighted_declarations: 2,
            weighted_organic_share: "0.1370",
            weighted_quality_share: "0.0890",
          },
        ],
        registered_canteen_declarations: () => [
          { name: "Cantine de l'école", sectors: ["Ecole primaire"], central: false, organic_share: "0.1020", quality_share: "0.0670", meets_targets: false, yearly_meals: 28000 },
        ],
      }),
      "33394",
    )

    expect(canteens).toMatchObject({ registered: 3, "daily-meals": 318 })
    expect(canteens?.years[0]).toMatchObject({ "weighted-organic-share": 13.7, "median-organic-share": 24.2, "meeting-targets": 1 })
    expect(canteens?.latest).toMatchObject({ year: 2024 })
    expect(canteens?.latest?.declarations[0]["organic-share"]).toBe(10.2)
  })

  test("a commune without a declaration has its register only", async () => {
    const canteens = await canteensOf(
      database({ registered_canteens: () => [{ canteens: "1", meals: null }], registered_canteen_communes: () => [] }),
      "17387",
    )

    expect(canteens).toMatchObject({ registered: 1, years: [] })
    expect(canteens?.latest).toBeUndefined()
  })
})

describe("agricultural schools", () => {
  const school = (id: string, code: string, distance: string) => ({
    id,
    name: "Lycée " + id,
    nature: "LEGTA",
    city: "VILLE",
    insee_code: code,
    trainings_count: 4,
    distance,
  })

  test("are those of the commune, without a distance", async () => {
    const schools = await schoolsOf(
      database({ registered_postal_codes: () => [school("a", "17415", "0"), school("b", "17284", "13.2")] }),
      "17415",
    )

    expect(schools?.["in-commune"]).toBe(true)
    expect(schools?.schools).toHaveLength(1)
    expect(schools?.schools[0].distance).toBeUndefined()
  })

  test("are the three nearest when the commune has none", async () => {
    const schools = await schoolsOf(
      database({
        registered_postal_codes: () => [
          school("a", "17284", "7.4"),
          school("b", "17415", "13.2"),
          school("c", "17415", "13.2"),
          school("d", "17100", "20"),
        ],
      }),
      "17387",
    )

    expect(schools?.["in-commune"]).toBe(false)
    expect(schools?.schools.map((found) => found.distance)).toEqual([7, 13, 13])
  })

  test("are searched by diploma, route and boarding, the nearest first", async () => {
    asked.length = 0

    const schools = await findSchools(
      database({
        registered_postal_codes: () => [
          {
            id: "a", name: "MFR", nature: "MFREO", sector: "privé", affiliation: "UNMFREO", address: null, postal_code: "17250",
            city: "VILLE", insee_code: "17284", phone: null, email: null, website: null, boarding: true, half_board: true,
            parent_name: null, distance: "7.4",
            trainings: [{ code: "1", name: "BTSA/Viticulture", diploma: "BTSA", speciality: null, route: "apprenticeship" }],
          },
        ],
      }),
      { diploma: "BTSA", route: "apprenticeship", boarding: true, q: "viti%" },
      { "insee-code": "17387", name: "ST PORCHAIRE" },
    )

    expect(asked[0].values).toEqual(["BTSA", "apprenticeship", "%viti %", "17387"])
    expect(asked[0].sql).toContain("s.boarding")
    expect(schools?.[0]).toMatchObject({ distance: 7, boarding: true })
    expect(schools?.[0].trainings[0].speciality).toBeUndefined()
  })
})

describe("the territory of a commune", () => {
  test("leaves out what is not in service", async () => {
    const territory = await territoryOf(database({ registered_hve_farms: () => [] }), "17387", { member: false })

    expect(territory.hve?.farms).toBe(0)
    expect(territory["quality-signs"]).toBeUndefined()
    expect(territory.canteens).toBeUndefined()
  })
})
