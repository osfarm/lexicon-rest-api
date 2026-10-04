import { describe, expect, test } from "bun:test"
import { givesScope } from "../access/Scope"
import { fileOfBundle } from "./Bundles"

describe("fileOfBundle", () => {
  test("designates a file inside the bundle", () => {
    expect(fileOfBundle("/bundles", "cultia", "index.json")).toBe(
      "/bundles/cultia/index.json",
    )
    expect(
      fileOfBundle("/bundles", "cultia", "units/2026.10.04.1/data/master_units_0.csv.gz"),
    ).toBe("/bundles/cultia/units/2026.10.04.1/data/master_units_0.csv.gz")
  })

  test("refuses to leave the bundle", () => {
    expect(fileOfBundle("/bundles", "cultia", "../other/index.json")).toBeUndefined()
    expect(
      fileOfBundle("/bundles", "cultia", "units/../../other/index.json"),
    ).toBeUndefined()
    expect(fileOfBundle("/bundles", "cultia", "/etc/passwd")).toBeUndefined()
    expect(fileOfBundle("/bundles", "cultia", "")).toBeUndefined()
    expect(fileOfBundle("/bundles", "cultia", "..")).toBeUndefined()
  })

  test("refuses a flavor that is not a plain name", () => {
    expect(fileOfBundle("/bundles", "..", "index.json")).toBeUndefined()
    expect(fileOfBundle("/bundles", "a/b", "index.json")).toBeUndefined()
    expect(fileOfBundle("/bundles", "", "index.json")).toBeUndefined()
  })
})

describe("givesScope", () => {
  test("an exact scope, or the wildcard of its family", () => {
    expect(givesScope(["open", "bundle:cultia"], "bundle:cultia")).toBe(true)
    expect(givesScope(["open", "bundle:*"], "bundle:cultia")).toBe(true)
    expect(givesScope(["open", "bundle:cultia"], "bundle:other")).toBe(false)
    expect(givesScope(["open", "members"], "bundle:cultia")).toBe(false)
    expect(givesScope(["bundle:*"], "members")).toBe(false)
  })
})
