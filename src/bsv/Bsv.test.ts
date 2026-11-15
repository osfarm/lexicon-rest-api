import { describe, expect, test } from "bun:test"
import {
  archiveDocumentOf,
  archiveSearchSql,
  bulletinOf,
  chosenEditions,
  currentSearchSql,
  departmentOf,
  editionsSql,
  linesSql,
  mergedSearch,
  riskQueryOf,
  risksForAgents,
  risksOf,
  searchBulletins,
  searchQueryOf,
  type SearchItem,
} from "./Bsv"

const NOW = new Date("2026-11-10T09:00:00Z")

const bulletinRow = {
  id: "f7aace8a",
  citation:
    "Bulletin de santé du végétal Nouvelle-Aquitaine grandes cultures n° 31 du 05/11/2026",
  label: "BSV GC Aquitaine n° 31",
  region: "nouvelle-aquitaine",
  sector: "grandes cultures",
  subsector: null,
  zone: "Aquitaine",
  nature: "bulletin",
  number: "31",
  pdf_url: "https://draaf.example/bsv31.pdf",
  article_url: "https://draaf.example/gc",
  published_on: "2026-11-05",
  recent: true,
}

const line = (overrides: object = {}) => ({
  id: "f7aace8a:1",
  bulletin_id: "f7aace8a",
  crop: "colza",
  production_names: ["winter_rape", "spring_rape"],
  pest: "charançon du bourgeon terminal",
  pest_type: "ravageur",
  stage: "3 feuilles à reprise",
  bbch_min: null,
  bbch_max: null,
  level: "fort",
  level_text: "intervention à raisonner",
  conditional: true,
  condition: "parcelles peu vigoureuses",
  risk_period: "jusqu'à la reprise",
  threshold: null,
  observations: "11 parcelles sur 13 avec captures",
  page: 13,
  source_quote: "pic de vol très probablement atteint",
  ...overrides,
})

describe("departmentOf", () => {
  test("two characters in metropolitan France, Corsica included", () => {
    expect(departmentOf("47001")).toBe("47")
    expect(departmentOf("2a004")).toBe("2A")
    expect(departmentOf("01001")).toBe("01")
  })

  test("three digits overseas", () => {
    expect(departmentOf("97411")).toBe("974")
  })

  test("what is not an INSEE code has none", () => {
    expect(departmentOf("Agen")).toBeUndefined()
    expect(departmentOf("4700")).toBeUndefined()
    expect(departmentOf("97911")).toBeUndefined()
  })
})

describe("riskQueryOf", () => {
  test("today when no date is given, what is empty is left out", () => {
    expect(
      riskQueryOf({ department: "47", crop: " colza ", production: "" }, NOW),
    ).toEqual({
      department: "47",
      crop: "colza",
      date: "2026-11-10",
    })
  })

  test("a malformed date is today, a crop of punctuation is no crop", () => {
    expect(riskQueryOf({ department: "2b", date: "soon", crop: "--" }, NOW)).toEqual({
      department: "2B",
      date: "2026-11-10",
    })
  })

  test("no department, no query", () => {
    expect(riskQueryOf({ department: "100" })).toBeUndefined()
    expect(riskQueryOf({})).toBeUndefined()
  })
})

describe("editionsSql and linesSql", () => {
  test("every value is bound; extracted bulletins of the department, up to the date", () => {
    const { text, values } = editionsSql({
      department: "47",
      crop: "colza'; DROP",
      date: "2026-11-10",
    })

    expect(values).toEqual(["2026-11-10", "colza'; DROP", "47"])
    expect(text).not.toContain("DROP")
    expect(text).toContain("department_codes @> ARRAY[$3]::varchar[]")
    expect(text).toContain("b.status = 'extracted'")
    expect(text).toContain("b.published_on <= $1::date")
    expect(text).toContain("$1::date - 21")
    expect(text).toContain("DISTINCT ON (edition)")
    // Only the bulletins that speak of the crop
    expect(text).toContain("EXISTS (SELECT 1 FROM")
  })

  test("without crop every bulletin counts", () => {
    const { text } = editionsSql({ department: "47", date: "2026-11-10" })

    expect(text).not.toContain("EXISTS")
  })

  test("a production is matched on the reference names of the lines", () => {
    const { text, values } = linesSql(["a", "b"], { production: "winter_rape" })

    expect(values).toEqual([["a", "b"], "winter_rape"])
    expect(text).toContain("r.production_names && ARRAY[$2]::varchar[]")
    expect(text).toContain(
      "array_position(ARRAY['tres_fort', 'fort', 'moyen', 'faible', 'nul', 'non_precise']",
    )
  })

  test("crop words are compared without accents, either holding the other", () => {
    const { text, values } = linesSql(["a"], { crop: "blé tendre" })

    expect(values).toEqual([["a"], "blé tendre"])
    expect(text).toContain("translate(lower($2::text)")
    expect(text).toContain("LIKE '% ' ||")
  })
})

describe("chosenEditions", () => {
  test("the recent bulletins of every edition", () => {
    const rows = [
      { id: "a", recent: true },
      { id: "b", recent: true },
      { id: "c", recent: false },
    ]

    expect(chosenEditions(rows)).toEqual({ stale: false, rows: rows.slice(0, 2) })
  })

  test("none recent: the latest one alone, said to be stale", () => {
    const rows = [
      { id: "c", recent: false },
      { id: "d", recent: false },
    ]

    expect(chosenEditions(rows)).toEqual({ stale: true, rows: [rows[0]] })
    expect(chosenEditions([])).toEqual({ stale: false, rows: [] })
  })
})

describe("risksOf", () => {
  const db = (lines: object[]) => ({
    query: async (text: string) => ({
      rows: text.includes("DISTINCT ON") ? [bulletinRow] : lines,
    }),
  })

  test("risks carry their bulletin; lines of stage are given apart", async () => {
    const risks = await risksOf(
      db([
        line(),
        line({
          id: "f7aace8a:2",
          pest: null,
          pest_type: "stade",
          stage: "B7",
          level: "non_precise",
        }),
      ]) as any,
      { department: "47", crop: "colza", date: "2026-11-10" },
    )

    expect(risks?.stale).toBe(false)
    expect(risks?.bulletins[0]).toMatchObject({
      id: "f7aace8a",
      region: "nouvelle-aquitaine",
    })
    expect(risks?.risks).toHaveLength(1)
    expect(risks?.risks[0]).toMatchObject({
      crop: "colza",
      pest: "charançon du bourgeon terminal",
      level: "fort",
      conditional: true,
      page: 13,
      "source-quote": "pic de vol très probablement atteint",
      bulletin: {
        id: "f7aace8a",
        "published-on": "2026-11-05",
        "pdf-url": "https://draaf.example/bsv31.pdf",
        links: { self: "/bsv/bulletins/f7aace8a" },
      },
    })
    expect(risks?.risks[0].threshold).toBeUndefined()
    expect(risks?.stages).toEqual([
      expect.objectContaining({
        crop: "colza",
        stage: "B7",
        bulletin: expect.any(Object),
      }),
    ])
  })

  test("the compact form names each bulletin once", async () => {
    const risks = await risksOf(db([line({ observations: "x".repeat(500) })]) as any, {
      department: "47",
      date: "2026-11-10",
    })
    const compact = risksForAgents(risks!)

    expect(compact.bulletins).toHaveLength(1)
    expect(compact.risks[0].bulletin).toBe("f7aace8a")
    expect(compact.risks[0].observations).toHaveLength(201)
  })

  test("a compact form too long cuts its texts, then leaves out the lowest risks saying so", async () => {
    const lines = ["fort", "moyen", "faible"].map((level, i) =>
      line({ id: `r${i}`, level, observations: "x".repeat(500) }),
    )
    const risks = await risksOf(db(lines) as any, {
      department: "47",
      date: "2026-11-10",
    })
    const whole = JSON.stringify(risksForAgents(risks!, 100000)).length

    const shorter = risksForAgents(risks!, whole - 100)
    expect(shorter.risks).toHaveLength(3)
    expect(shorter.risks[0].observations).toHaveLength(101)
    expect(shorter["omitted-risks"]).toBeUndefined()

    const shortest = risksForAgents(risks!, JSON.stringify(shorter).length - 1)
    expect(shortest.risks).toHaveLength(3)
    expect(shortest.risks[0].observations).toHaveLength(61)

    const budget = JSON.stringify(shortest).length - 50
    const fewer = risksForAgents(risks!, budget)
    expect(fewer.risks.map((risk) => risk.level)).toEqual(["fort", "moyen"])
    expect(fewer["omitted-risks"]).toBe(1)
    expect(JSON.stringify(fewer).length).toBeLessThanOrEqual(budget)
  })

  test("the bulletins not in service give undefined", async () => {
    const failing = {
      query: async () => {
        throw new Error("relation does not exist")
      },
    }

    expect(
      await risksOf(failing as any, { department: "47", date: "2026-11-10" }),
    ).toBeUndefined()
    expect(await bulletinOf(failing as any, "x")).toBeUndefined()
    expect(await archiveDocumentOf(failing as any, "x")).toBeUndefined()
  })
})

describe("searchQueryOf", () => {
  test("years stand for their first and last days", () => {
    expect(
      searchQueryOf({
        q: " mildiou ",
        from: 1980,
        to: "1990",
        department: "2a",
        corpus: "x",
      }),
    ).toEqual({ q: "mildiou", from: "1980-01-01", to: "1990-12-31", department: "2A" })
  })

  test("dates are kept, no words no search", () => {
    expect(searchQueryOf({ q: "a", from: "2026-03-01", corpus: "archive" })).toEqual({
      q: "a",
      from: "2026-03-01",
      corpus: "archive",
    })
    expect(searchQueryOf({ q: "  " })).toBeUndefined()
  })
})

describe("search queries", () => {
  test("bulletins of today: every value is bound, replaced bulletins left out", () => {
    const { text, values } = currentSearchSql(
      { q: "mildiou'; DROP", department: "47", from: "2026-01-01" },
      20,
    )

    expect(values).toEqual(["mildiou'; DROP", "47", "2026-01-01", 20])
    expect(text).not.toContain("DROP")
    expect(text).toContain("websearch_to_tsquery('french'")
    expect(text).toContain("NOT IN ('superseded', 'refused')")
    expect(text).toContain("ts_headline")
  })

  test("the archive is filtered by year when it has no date", () => {
    const { text, values } = archiveSearchSql({ q: "mildiou", to: "1990-12-31" }, 10)

    expect(values).toEqual(["mildiou", "1990-12-31", 10])
    expect(text).toContain(
      "COALESCE(d.published_on, make_date(d.year, 1, 1)) <= $2::date",
    )
  })
})

const item = (
  corpus: "current" | "archive",
  id: string,
  rank: number,
  date?: string,
): SearchItem => ({
  corpus,
  id,
  title: id,
  date,
  regions: [],
  "department-codes": [],
  rank,
  links: { self: `/${id}` },
})

describe("mergedSearch", () => {
  test("the bulletins of today come first, whatever the rank of the archive", () => {
    const answers = {
      current: {
        total: 2,
        items: [item("current", "a", 0.2, "2026-01-01"), item("current", "b", 0.1)],
      },
      archive: {
        total: 2,
        items: [item("archive", "c", 0.9, "1980-05-01"), item("archive", "d", 0.8)],
      },
    }

    expect(
      mergedSearch(answers, { limit: 3, offset: 0 }).items.map((one) => one.id),
    ).toEqual(["a", "b", "c"])
    expect(
      mergedSearch(answers, { limit: 2, offset: 2 }).items.map((one) => one.id),
    ).toEqual(["c", "d"])
  })

  test("one list by rank then date; a corpus not in service is null", () => {
    const merged = mergedSearch(
      {
        current: {
          total: 2,
          items: [item("current", "b", 0.1), item("current", "a", 0.5, "2026-01-01")],
        },
        archive: { total: 1, items: [item("archive", "c", 0.5, "1980-05-01")] },
      },
      { limit: 2, offset: 0 },
    )

    expect(merged.total).toBe(3)
    expect(merged.corpora).toEqual({ current: 2, archive: 1 })
    expect(merged.items.map((one) => one.id)).toEqual(["a", "b"])
    expect(mergedSearch({ archive: undefined }, { limit: 5, offset: 0 }).corpora).toEqual(
      {
        archive: null,
      },
    )
  })
})

describe("searchBulletins", () => {
  test("the archive not in service: the bulletins of today alone, and it is said", async () => {
    const db = {
      query: async (text: string) => {
        if (text.includes("archive_documents")) {
          throw new Error("relation does not exist")
        }

        return {
          rows: [
            {
              ...bulletinRow,
              page: 2,
              rank: 0.3,
              total: "1",
              excerpt: "méligèthes\n sur colza",
            },
          ],
        }
      },
    }
    const found = await searchBulletins(
      db as any,
      { q: "méligèthes" },
      { limit: 10, offset: 0 },
    )

    expect(found?.corpora).toEqual({ current: 1, archive: null })
    expect(found?.items[0]).toMatchObject({
      corpus: "current",
      title: bulletinRow.citation,
      page: 2,
      excerpt: "méligèthes sur colza",
      links: { self: "/bsv/bulletins/f7aace8a" },
    })
  })

  test("nothing has every word: any of them is enough", async () => {
    const asked: unknown[] = []
    const db = {
      query: async (_text: string, values: unknown[]) => {
        asked.push(values[0])

        return {
          rows: asked.length === 1 ? [] : [{ ...bulletinRow, rank: 0.1, total: "1" }],
        }
      },
    }
    const found = await searchBulletins(
      db as any,
      { q: "mildiou cuivre", corpus: "current" },
      { limit: 10, offset: 0 },
    )

    expect(asked).toEqual(["mildiou cuivre", "mildiou or cuivre"])
    expect(found).toMatchObject({ total: 1, relaxed: true })
  })

  test("no corpus in service gives undefined", async () => {
    const db = {
      query: async () => {
        throw new Error("relation does not exist")
      },
    }

    expect(
      await searchBulletins(db as any, { q: "mildiou" }, { limit: 10, offset: 0 }),
    ).toBeUndefined()
  })
})
