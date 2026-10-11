import { describe, expect, test } from "bun:test"
import {
  addressEntryOf,
  addressMatches,
  allowsCaller,
  domainEntryOf,
  domainMatches,
  NO_RESTRICTION,
  restrictionsIn,
} from "./Restriction"

describe("an address entry", () => {
  test("is an IPv4 address or a range", () => {
    expect(addressEntryOf(" 203.0.113.7 ")).toBe("203.0.113.7")
    expect(addressEntryOf("203.0.113.0/24")).toBe("203.0.113.0/24")
    expect(addressEntryOf("203.0.113.7/32")).toBe("203.0.113.7")
    expect(addressEntryOf("010.0.0.1")).toBe("10.0.0.1")
  })

  test("is refused when it is not one, or opens the key to nearly everyone", () => {
    expect(addressEntryOf("203.0.113.256")).toBeUndefined()
    expect(addressEntryOf("203.0.113")).toBeUndefined()
    expect(addressEntryOf("2001:db8::1")).toBeUndefined()
    expect(addressEntryOf("203.0.113.0/33")).toBeUndefined()
    expect(addressEntryOf("0.0.0.0/0")).toBeUndefined()
    expect(addressEntryOf("example.org")).toBeUndefined()
  })

  test("matches the address alone, or every address of the range", () => {
    expect(addressMatches("203.0.113.7", "203.0.113.7")).toBe(true)
    expect(addressMatches("203.0.113.8", "203.0.113.7")).toBe(false)
    expect(addressMatches("203.0.113.200", "203.0.113.0/24")).toBe(true)
    expect(addressMatches("203.0.114.1", "203.0.113.0/24")).toBe(false)
    expect(addressMatches("203.0.113.130", "203.0.113.128/25")).toBe(true)
    expect(addressMatches("203.0.113.10", "203.0.113.128/25")).toBe(false)
    expect(addressMatches("::ffff:203.0.113.7", "203.0.113.7")).toBe(true)
    expect(addressMatches("2001:db8::1", "203.0.113.7")).toBe(false)
    expect(addressMatches("unknown", "203.0.113.0/24")).toBe(false)
  })
})

describe("a domain entry", () => {
  test("is a host name, taken from an address when one is typed", () => {
    expect(domainEntryOf("Example.ORG")).toBe("example.org")
    expect(domainEntryOf("https://app.example.org/carte?x=1")).toBe("app.example.org")
    expect(domainEntryOf("app.example.org/carte")).toBe("app.example.org")
    expect(domainEntryOf("*.example.org")).toBe("*.example.org")
  })

  test("is refused when it is not a host name", () => {
    expect(domainEntryOf("localhost")).toBeUndefined()
    expect(domainEntryOf("*")).toBeUndefined()
    expect(domainEntryOf("*.org")).toBeUndefined()
    expect(domainEntryOf("exa mple.org")).toBeUndefined()
    expect(domainEntryOf("203.0.113.7")).toBeUndefined()
  })

  test("matches that host only, unless subdomains are asked for", () => {
    expect(domainMatches("example.org", "example.org")).toBe(true)
    expect(domainMatches("app.example.org", "example.org")).toBe(false)
    expect(domainMatches("app.example.org", "*.example.org")).toBe(true)
    expect(domainMatches("example.org", "*.example.org")).toBe(false)
    expect(domainMatches("badexample.org", "*.example.org")).toBe(false)
    expect(domainMatches("example.org.evil.net", "example.org")).toBe(false)
  })
})

describe("what a member typed", () => {
  test("is read entry by entry, whatever separates them", () => {
    const read = restrictionsIn("203.0.113.7, 198.51.100.0/24\n203.0.113.7", "example.org app.example.org")

    expect(read.restrictions).toEqual({
      addresses: ["203.0.113.7", "198.51.100.0/24"],
      domains: ["example.org", "app.example.org"],
    })
    expect(read.refused).toEqual([])
    expect(read.tooMany).toBe(false)
  })

  test("names what could not be understood", () => {
    expect(restrictionsIn("203.0.113.7 chez-moi", "pas un domaine").refused).toEqual([
      "chez-moi",
      "pas",
      "un",
      "domaine",
    ])
  })

  test("is refused beyond twenty entries", () => {
    const many = Array.from({ length: 21 }, (_, index) => `203.0.113.${index}`).join(" ")

    expect(restrictionsIn(many, "").tooMany).toBe(true)
  })
})

describe("a key", () => {
  const narrowed = { addresses: ["203.0.113.0/24"], domains: ["app.example.org"] }

  test("without restriction is used from anywhere", () => {
    expect(allowsCaller(NO_RESTRICTION, "198.51.100.1", null)).toBe(true)
  })

  test("narrowed to addresses and domains needs one of them", () => {
    expect(allowsCaller(narrowed, "203.0.113.9", null)).toBe(true)
    expect(allowsCaller(narrowed, "198.51.100.1", "https://app.example.org")).toBe(true)
    expect(allowsCaller(narrowed, "198.51.100.1", "https://app.example.org/carte")).toBe(true)
    expect(allowsCaller(narrowed, "198.51.100.1", "https://other.example.org")).toBe(false)
    expect(allowsCaller(narrowed, "198.51.100.1", null)).toBe(false)
    expect(allowsCaller(narrowed, "198.51.100.1", "not an address")).toBe(false)
  })

  test("narrowed to addresses only ignores what the caller announces", () => {
    const addresses = { addresses: ["203.0.113.7"], domains: [] }

    expect(allowsCaller(addresses, "198.51.100.1", "https://app.example.org")).toBe(false)
    expect(allowsCaller(addresses, "203.0.113.7", null)).toBe(true)
  })
})
