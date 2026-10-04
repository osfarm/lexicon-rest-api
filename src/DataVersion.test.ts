import { describe, expect, test } from "bun:test"
import { DataVersion } from "./DataVersion"

function setup(versions: (string | Error)[]) {
  const state = { cleared: 0, queries: 0, time: 0 }
  const cache = { clear: () => state.cleared++ }
  const db = {
    query: () => {
      const version = versions[Math.min(state.queries, versions.length - 1)]
      state.queries++

      return version instanceof Error
        ? Promise.reject(version)
        : Promise.resolve({ rows: [{ version }] })
    },
  }
  const dataVersion = new DataVersion(cache, () => state.time, 30000)

  return { state, db: db as never, dataVersion }
}

describe("DataVersion", () => {
  test("the first look does not empty the cache", async () => {
    const { state, db, dataVersion } = setup(["2026-10-04/38"])

    await dataVersion.refresh(db)

    expect(state.cleared).toBe(0)
    expect(state.queries).toBe(1)
  })

  test("the database is read at most once per interval", async () => {
    const { state, db, dataVersion } = setup(["2026-10-04/38"])

    await dataVersion.refresh(db)
    state.time = 29000
    await dataVersion.refresh(db)

    expect(state.queries).toBe(1)

    state.time = 31000
    await dataVersion.refresh(db)

    expect(state.queries).toBe(2)
    expect(state.cleared).toBe(0)
  })

  test("a new version empties the cache once", async () => {
    const { state, db, dataVersion } = setup(["2026-10-04/38", "2026-10-05/38"])

    await dataVersion.refresh(db)
    state.time = 31000
    await dataVersion.refresh(db)
    state.time = 62000
    await dataVersion.refresh(db)

    expect(state.cleared).toBe(1)
  })

  test("concurrent callers share one look", async () => {
    const { state, db, dataVersion } = setup(["2026-10-04/38"])

    await Promise.all([
      dataVersion.refresh(db),
      dataVersion.refresh(db),
      dataVersion.refresh(db),
    ])

    expect(state.queries).toBe(1)
  })

  test("a database without package registry keeps its cache", async () => {
    const { state, db, dataVersion } = setup([new Error("relation does not exist")])

    await dataVersion.refresh(db)
    state.time = 31000
    await dataVersion.refresh(db)

    expect(state.cleared).toBe(0)
  })
})
