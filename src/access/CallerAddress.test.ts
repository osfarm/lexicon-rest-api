import { describe, expect, test } from "bun:test"
import { callerAddress } from "./CallerAddress"

describe("callerAddress", () => {
  test("behind one proxy, the address it appended is the caller", () => {
    expect(callerAddress("203.0.113.7", "10.0.0.2", 1)).toBe("203.0.113.7")
  })

  test("an address forged by the caller is ignored", () => {
    expect(callerAddress("1.2.3.4, 203.0.113.7", "10.0.0.2", 1)).toBe("203.0.113.7")
  })

  test("behind two proxies, the entry before the last is the caller", () => {
    expect(callerAddress("1.2.3.4, 203.0.113.7, 10.0.0.9", "10.0.0.2", 2)).toBe(
      "203.0.113.7",
    )
  })

  test("without trusted proxy the header is not believed", () => {
    expect(callerAddress("1.2.3.4", "198.51.100.1", 0)).toBe("198.51.100.1")
  })

  test("without header the socket address is used", () => {
    expect(callerAddress(null, "198.51.100.1", 1)).toBe("198.51.100.1")
    expect(callerAddress("", undefined, 1)).toBe("unknown")
  })

  test("fewer entries than trusted proxies falls back to the socket", () => {
    expect(callerAddress("203.0.113.7", "10.0.0.2", 2)).toBe("10.0.0.2")
  })
})
