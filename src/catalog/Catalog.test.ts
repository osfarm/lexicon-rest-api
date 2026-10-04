import { describe, expect, test } from "bun:test"
import { datasetOf } from "./Catalog"

const row = (manifest: object, overrides: object = {}) => ({
  name: "phytosanitary",
  version: "2026.10.04.1",
  loaded_at: new Date("2026-10-04T08:00:00Z"),
  stale: false,
  manifest,
  ...overrides,
})

describe("datasetOf", () => {
  test("publishes what the package says about itself", () => {
    const dataset = datasetOf(
      row({
        description: "Plant protection products",
        credits: [
          {
            provider: "ANSES",
            licence: "Open Licence",
            licence_url: "https://example.org/licence",
            url: "https://ephy.anses.fr",
            updated_at: "2026-09-01",
          },
        ],
        tables: [
          { name: "registered_phytosanitary_products", rows: 16095 },
          { name: "registered_phytosanitary_usages", rows: 84916 },
        ],
        depends_on: [
          { name: "taxonomy", kind: "foreign_key", built_against: "2026.10.03.3" },
        ],
      }),
      new Map([["taxonomy", "2026.10.03.3"]]),
      [
        { version: "2026.10.03.1", is_current: false },
        { version: "2026.10.04.1", is_current: true },
      ],
    )

    expect(dataset.description).toBe("Plant protection products")
    expect(dataset.provider).toBe("ANSES")
    expect(dataset["source-date"]).toBe("2026-09-01")
    expect(dataset.rows).toBe(101011)
    expect(dataset["loaded-at"]).toBe("2026-10-04T08:00:00.000Z")
    expect(dataset["depends-on"]).toEqual([
      {
        name: "taxonomy",
        kind: "foreign_key",
        "built-against": "2026.10.03.3",
        "in-service": "2026.10.03.3",
      },
    ])
    expect(dataset.versions.map((entry) => entry.current)).toEqual([false, true])
    expect(dataset.versions[1].download).toBe(
      "https://lexicon-packages.osfarm.org/phytosanitary/2026.10.04.1/",
    )
    expect(dataset.href).toBe("/catalog/phytosanitary")
  })

  test("a reserved dataset is listed without download link", () => {
    const dataset = datasetOf(row({ scope: "members" }), new Map(), [
      { version: "2026.10.04.1", is_current: true },
    ])

    expect(dataset.scope).toBe("members")
    expect(dataset.versions[0].download).toBeNull()
  })

  test("the table of translations is not shown", () => {
    const dataset = datasetOf(
      row({
        tables: [
          { name: "master_units", rows: 113 },
          { name: "units__translations", rows: 189, role: "translations" },
        ],
      }),
      new Map(),
      [],
    )

    expect(dataset.tables).toEqual([{ name: "master_units", rows: 113 }])
    expect(dataset.rows).toBe(113)
  })

  test("an old manifest without the newer fields is still described", () => {
    const dataset = datasetOf(row({}), new Map(), [])

    expect(dataset.scope).toBe("open")
    expect(dataset.description).toBeNull()
    expect(dataset.licence).toBeNull()
    expect(dataset.tables).toEqual([])
    expect(dataset.pivots).toEqual([])
  })
})
