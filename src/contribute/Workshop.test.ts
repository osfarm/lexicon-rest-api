import { describe, expect, test } from "bun:test"
import {
  expiredKeyCookie,
  keyCookie,
  keyIn,
  relay,
  SECRET_HEADER,
  upstreamOf,
  WORKSPACE_HEADER,
  workshopOf,
} from "./Workshop"

const KEY = "lex_abcd1234_" + "A".repeat(32)
const workshop = { url: "http://contribute:8787", secret: "s3cret" }

describe("the contribution tool online", () => {
  test("is offered only when the address and the secret are both set", () => {
    expect(workshopOf({})).toBeUndefined()
    expect(workshopOf({ CONTRIBUTE_URL: "http://contribute:8787" })).toBeUndefined()
    expect(
      workshopOf({ CONTRIBUTE_URL: "http://contribute:8787/", CONTRIBUTE_SECRET: " x " }),
    ).toEqual({ url: "http://contribute:8787", secret: "x" })
  })

  test("the key is read from its cookie, and nothing else is taken for a key", () => {
    expect(keyIn(`lang=fr; lexicon_contribute=${KEY}`)).toBe(KEY)
    expect(keyIn("lexicon_contribute=lex_short")).toBeUndefined()
    expect(keyIn(null)).toBeUndefined()
  })

  test("the cookie is limited to the tool and unreadable by scripts", () => {
    const cookie = keyCookie(KEY, true)

    expect(cookie).toContain("Path=/contribute/outil")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).toContain("Secure")
    expect(keyCookie(KEY, false)).not.toContain("Secure")
    expect(expiredKeyCookie()).toContain("Max-Age=0")
  })

  test("an address of the site becomes the one of the tool", () => {
    const at = (path: string) => upstreamOf(workshop, "https://lexicon.osfarm.org" + path)

    expect(at("/contribute/outil")).toBe("http://contribute:8787/")
    expect(at("/contribute/outil/jeux/releves/etat?x=1")).toBe(
      "http://contribute:8787/jeux/releves/etat?x=1",
    )
    expect(at("/contribute/outilleur")).toBeUndefined()
    expect(at("/admin")).toBeUndefined()
  })

  test("a request is relayed with the workspace and the secret, never the cookie", async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const fetcher = async (url: string, init: RequestInit) => {
      seen.push({ url, init })

      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": "leak=1" },
      })
    }
    const request = new Request("https://lexicon.osfarm.org/contribute/outil/jeux/a/fiche", {
      method: "POST",
      headers: {
        Cookie: `lexicon_contribute=${KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Lexicon-Token": "page",
        "X-Lexicon-Workspace": "someoneelse",
      },
      body: "description=x",
    })

    const answer = await relay(workshop, request, "abcd1234", fetcher)
    const sent = new Headers(seen[0].init.headers)

    expect(seen[0].url).toBe("http://contribute:8787/jeux/a/fiche")
    expect(sent.get(WORKSPACE_HEADER)).toBe("abcd1234")
    expect(sent.get(SECRET_HEADER)).toBe("s3cret")
    expect(sent.get("x-lexicon-token")).toBe("page")
    expect(sent.get("cookie")).toBeNull()
    expect(answer.status).toBe(200)
    expect(answer.headers.get("set-cookie")).toBeNull()
    expect(answer.headers.get("cache-control")).toBe("no-store")
  })

  test("a tool that does not answer is said, not thrown", async () => {
    const request = new Request("https://lexicon.osfarm.org/contribute/outil")
    const answer = await relay(workshop, request, "abcd1234", async () => {
      throw new Error("connection refused")
    })

    expect(answer.status).toBe(502)
  })
})
