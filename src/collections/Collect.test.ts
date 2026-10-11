import { describe, expect, test } from "bun:test"
import {
  csvOf,
  datasetsOf,
  describeZone,
  featureCollectionIn,
  identifiersIn,
  MAXIMUM_FEATURES,
  zoneIn,
} from "./Collect"
import { isShareId } from "./CollectionStore"
import { editorFileOf, editorLink, editorUrlOf } from "./Editor"

describe("the zone of a collection", () => {
  test("is a commune given by its INSEE code", () => {
    expect(zoneIn("cadastre", { by: "commune", commune: "17387" })).toEqual({
      zone: { by: "commune", inseeCode: "17387" },
    })
    expect(zoneIn("cadastre", { by: "commune", commune: "2a004" })).toEqual({
      zone: { by: "commune", inseeCode: "2A004" },
    })
    expect("problem" in zoneIn("cadastre", { by: "commune", commune: "Saint" })).toBe(true)
  })

  test("is a circle around a point, five kilometres at most", () => {
    const fields = { by: "point", latitude: "45,8231", longitude: "-0.783", radius: "500" }

    expect(zoneIn("pac", fields)).toEqual({
      zone: { by: "point", latitude: 45.8231, longitude: -0.783, radius: 500 },
    })
    expect("problem" in zoneIn("pac", { ...fields, radius: "5001" })).toBe(true)
    expect("problem" in zoneIn("pac", { ...fields, latitude: "" })).toBe(true)
    expect("problem" in zoneIn("pac", { ...fields, latitude: "95" })).toBe(true)
  })

  test("is a list of identifiers, cadastral ones being checked", () => {
    expect(identifiersIn("17387000av0659, 17387000AV0001\n17387000AV0659")).toEqual([
      "17387000AV0659",
      "17387000AV0001",
    ])
    expect(zoneIn("cadastre", { by: "identifiers", identifiers: "17387000AV0659" })).toEqual({
      zone: { by: "identifiers", identifiers: ["17387000AV0659"] },
    })
    expect("problem" in zoneIn("cadastre", { by: "identifiers", identifiers: "AV 659" })).toBe(true)
    expect("problem" in zoneIn("cadastre", { by: "identifiers", identifiers: " " })).toBe(true)
    expect("zone" in zoneIn("pac", { by: "identifiers", identifiers: "1600800" })).toBe(true)
  })

  test("is told in words", () => {
    expect(describeZone({ by: "commune", inseeCode: "17387" }, "ST PORCHAIRE")).toBe(
      "commune ST PORCHAIRE (17387)",
    )
    expect(describeZone({ by: "identifiers", identifiers: ["a", "b"] })).toBe("2 identifiants")
  })
})

describe("the datasets of a collection", () => {
  test("depend on the kind of parcels: owners and sales are cadastral", () => {
    const keys = (kind: "cadastre" | "pac") => datasetsOf(kind).map((dataset) => dataset.key)

    expect(keys("cadastre")).toContain("proprietaires")
    expect(keys("pac")).not.toContain("proprietaires")
    expect(keys("pac")).not.toContain("transactions")
    expect(keys("pac")).toContain("sol")
  })
})

describe("a document coming back from the editor", () => {
  const feature = { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { a: 1 } }

  test("is kept when it is a GeoJSON collection, features reduced to what GeoJSON says", () => {
    const read = featureCollectionIn({
      type: "FeatureCollection",
      features: [{ ...feature, id: "x", extra: "dropped" }, { type: "Feature", geometry: null, properties: null }],
    })

    expect("collection" in read && read.collection.features).toEqual([
      { type: "Feature", id: "x", geometry: feature.geometry, properties: { a: 1 } },
      { type: "Feature", geometry: null, properties: {} },
    ])
  })

  test("is refused when it is something else, or too large", () => {
    expect("problem" in featureCollectionIn({ type: "Point" })).toBe(true)
    expect("problem" in featureCollectionIn(undefined)).toBe(true)
    expect("problem" in featureCollectionIn({ type: "FeatureCollection", features: [{ type: "Point" }] })).toBe(true)
    expect(
      "problem" in
        featureCollectionIn({
          type: "FeatureCollection",
          features: Array.from({ length: MAXIMUM_FEATURES + 1 }, () => feature),
        }),
    ).toBe(true)
  })

  test("is told as a table, one column per property met", () => {
    expect(
      csvOf({
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: null, properties: { nom: "A", note: 'dit "le pré", au nord' } },
          { type: "Feature", geometry: null, properties: { nom: "B", surface: 12 } },
        ],
      }),
    ).toBe('nom,note,surface\nA,"dit ""le pré"", au nord",\nB,,12\n')
  })
})

describe("a shared collection", () => {
  test("has an address of twenty-two characters that cannot be guessed", () => {
    expect(isShareId("AbCdEfGhIjKlMnOpQrStU_")).toBe(true)
    expect(isShareId("12")).toBe(false)
    expect(isShareId("AbCdEfGhIjKlMnOpQrStU/")).toBe(false)
  })
})

describe("the editor", () => {
  test("is in service when its address is set", () => {
    expect(editorUrlOf({ EDITOR_URL: "http://editor:80/" })).toBe("http://editor:80")
    expect(editorUrlOf({})).toBeUndefined()
    expect(editorUrlOf({ EDITOR_URL: "editor" })).toBeUndefined()
  })

  test("opens a collection by the path it answers at", () => {
    expect(editorLink("/account/collections/12", "http://editor")).toBe(
      "/collections/editor/?collecte=%2Faccount%2Fcollections%2F12",
    )
    expect(editorLink("/account/collections/12", undefined)).toBeUndefined()
  })

  test("is relayed file by file, never outside itself", () => {
    const from = (path: string) => editorFileOf("http://editor", "https://lexicon.test" + path)

    expect(from("/collections/editor")).toBe("http://editor/")
    expect(from("/collections/editor/")).toBe("http://editor/")
    expect(from("/collections/editor/assets/index-abc.js?x=1")).toBe("http://editor/assets/index-abc.js")
    expect(from("/collections/editor/fonts/Noto%20Sans%20Bold/0-255.pbf")).toBe(
      "http://editor/fonts/Noto%20Sans%20Bold/0-255.pbf",
    )
    expect(from("/collections/editor/%2e%2e/secret")).toBeUndefined()
    expect(from("/collections/editors")).toBeUndefined()
  })
})
