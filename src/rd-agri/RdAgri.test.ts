import { describe, expect, test } from "bun:test"
import {
  filtersOf,
  readDocument,
  recordOf,
  relaxedQuery,
  searchDocuments,
  searchSql,
  summaryOf,
} from "./RdAgri"

const row = {
  id: "itab_243",
  title: "Lutte contre le mildiou",
  publication_year: 2022,
  publisher: "ITAB",
  description: "x".repeat(400),
  page_url: "https://rd-agri.fr/detail/itab_243",
  language: "fra",
  keywords: ["cuivre", "vigne"],
  project_code: null,
  project_name: null,
  notice_url: null,
  document_url: null,
}

describe("filtersOf", () => {
  test("keeps what is filled and well formed", () => {
    expect(
      filtersOf({
        q: "  mildiou vigne ",
        production: "",
        "year-from": "2020",
        "year-to": "soon",
        unknown: "x",
      }),
    ).toEqual({ q: "mildiou vigne", "year-from": 2020 })
  })

  test("a very long text is cut", () => {
    expect(filtersOf({ q: "a".repeat(500) }).q).toHaveLength(200)
  })
})

describe("relaxedQuery", () => {
  test("several words become alternatives", () => {
    expect(relaxedQuery('mildiou "vigne" bio')).toBe("mildiou or vigne or bio")
  })

  test("a single word cannot be relaxed", () => {
    expect(relaxedQuery("mildiou")).toBeUndefined()
    expect(relaxedQuery("le or de")).toBeUndefined()
  })
})

describe("searchSql", () => {
  test("every value is bound, none is written in the query", () => {
    const { text, values } = searchSql(
      { q: "mildiou'; DROP", production: "vine", "year-from": 2020 },
      { limit: 10, offset: 20 },
    )

    expect(values).toEqual(["mildiou'; DROP", "vine", 2020, 10, 20])
    expect(text).not.toContain("DROP")
    expect(text).toContain("websearch_to_tsquery('french'")
    expect(text).toContain("link.production = $2")
    expect(text).toContain("ts_rank")
    expect(text).toContain("LIMIT $4 OFFSET $5")
  })

  test("without filter, every document is listed by year", () => {
    const { text, values } = searchSql({}, { limit: 50, offset: 0 })

    expect(text).not.toContain("WHERE")
    expect(text).not.toContain("ts_rank")
    expect(values).toEqual([50, 0])
  })

  test("a pest is found by its reference or by its label", () => {
    const { text, values } = searchSql({ pest: "mildiou" }, { limit: 5, offset: 0 })

    expect(text).toContain("link.pest_reference = $1 OR link.label ILIKE")
    expect(values).toEqual(["mildiou", "mildiou", 5, 0])
  })
})

describe("summaryOf and recordOf", () => {
  test("a summary has a short excerpt and its own link", () => {
    const summary = summaryOf(row)

    expect(summary.excerpt).toHaveLength(301)
    expect(summary.links.self).toBe("/rd-agri/documents/itab_243")
    expect(summary.year).toBe(2022)
  })

  test("a record carries its links to the other datasets", () => {
    const record = recordOf(row, {
      productions: [{ production: "vine" }],
      taxa: [],
      systems: [{ production_system: "organic_farming" }],
      areas: [{ area_kind: "region", area_code: "75" }],
      pests: [{ pest_source: "ephy_target", pest_reference: "12", label: "Mildiou" }],
    })

    expect(record.productions).toEqual(["vine"])
    expect(record["production-systems"]).toEqual(["organic_farming"])
    expect(record.areas).toEqual([{ kind: "region", code: "75" }])
    expect(record.pests[0].label).toBe("Mildiou")
    expect(record.project).toBeNull()
  })
})

describe("searchDocuments", () => {
  test("no document with all the words: those with any of them are given", async () => {
    const asked: unknown[][] = []
    const db = {
      query: async (_text: string, values: unknown[]) => {
        asked.push(values)

        return { rows: asked.length === 1 ? [] : [{ ...row, total: "1" }] }
      },
    }

    const result = await searchDocuments(
      db as any,
      { q: "mildiou cuivre" },
      {
        limit: 10,
        offset: 0,
      },
    )

    expect(asked.map((values) => values[0])).toEqual([
      "mildiou cuivre",
      "mildiou or cuivre",
    ])
    expect(result).toMatchObject({ total: 1, relaxed: true })
  })

  test("a dataset that is not in service gives undefined", async () => {
    const db = {
      query: async () => {
        throw new Error("relation does not exist")
      },
    }

    expect(await searchDocuments(db as any, {}, { limit: 10, offset: 0 })).toBeUndefined()
    expect(await readDocument(db as any, "x")).toBeUndefined()
  })
})

describe("readDocument", () => {
  test("an unknown document gives null", async () => {
    expect(
      await readDocument({ query: async () => ({ rows: [] }) } as any, "nope"),
    ).toBeNull()
  })
})
