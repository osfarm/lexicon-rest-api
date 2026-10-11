import { describe, expect, test } from "bun:test"
import { invitationMail, mailSettingsOf, passwordLink, resetMail, sendMail } from "./Mailer"
import { isToken, lifetimeOf, memberCookie, memberTokenIn, newMemberToken, passwordProblem } from "./MemberSession"
import { membershipRuns } from "./MemberStore"

const MEMBER = { name: "Ferme des Essards", email: "contact@ferme.example" }

describe("mail settings", () => {
  test("need the server, the sender and the public address of the site", () => {
    expect(mailSettingsOf({ SMTP_URL: "smtp://mail:25", MAIL_FROM: "lexicon@osfarm.org" })).toBeUndefined()
    expect(
      mailSettingsOf({
        SMTP_URL: "smtp://mail:25",
        MAIL_FROM: "lexicon@osfarm.org",
        PUBLIC_URL: "https://lexicon.osfarm.org/",
      }),
    ).toEqual({
      smtpUrl: "smtp://mail:25",
      from: "lexicon@osfarm.org",
      publicUrl: "https://lexicon.osfarm.org",
    })
  })

  test("without them nothing is sent", async () => {
    expect(await sendMail(invitationMail(MEMBER, "https://x"), undefined)).toBe(false)
  })
})

describe("a link to choose a password", () => {
  const token = newMemberToken()

  test("leads to the member area of the site", () => {
    expect(passwordLink("https://lexicon.osfarm.org/", token)).toBe(
      `https://lexicon.osfarm.org/account/password?token=${token}`,
    )
  })

  test("is carried by the invitation and by the reset mail, addressed to the member", () => {
    const link = passwordLink("https://lexicon.osfarm.org", token)

    expect(invitationMail(MEMBER, link).to).toBe(MEMBER.email)
    expect(invitationMail(MEMBER, link).text).toContain(link)
    expect(invitationMail(MEMBER, link).text).toContain("sept jours")
    expect(resetMail(MEMBER, link).text).toContain(link)
    expect(resetMail(MEMBER, link).text).toContain("une heure")
  })

  test("lasts a week for an invitation, an hour for a forgotten password", () => {
    expect(lifetimeOf("invitation")).toBe(7 * 24 * 3600 * 1000)
    expect(lifetimeOf("reset")).toBe(3600 * 1000)
  })
})

describe("a member session", () => {
  test("is read from its own cookie only", () => {
    const token = newMemberToken()

    expect(isToken(token)).toBe(true)
    expect(memberTokenIn(`a=b; lexicon_member=${token}`)).toBe(token)
    expect(memberTokenIn(`lexicon_admin=${token}`)).toBeUndefined()
    expect(memberTokenIn("lexicon_member=abc")).toBeUndefined()
    expect(memberTokenIn(null)).toBeUndefined()
  })

  test("keeps its cookie to the member area, out of reach of scripts and other sites", () => {
    const cookie = memberCookie(newMemberToken(), true)

    expect(cookie).toContain("Path=/account")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).toContain("Secure")
    expect(memberCookie(newMemberToken(), false)).not.toContain("Secure")
  })
})

describe("a password", () => {
  test("needs twelve characters, typed twice alike", () => {
    expect(passwordProblem("trop court", "trop court")).toContain("au moins 12")
    expect(passwordProblem("assez long pour passer", "assez long pour passe")).toContain("diffèrent")
    expect(passwordProblem("assez long pour passer", "assez long pour passer")).toBeUndefined()
    expect(passwordProblem("x".repeat(201), "x".repeat(201))).toContain("dépasser")
  })
})

describe("a membership", () => {
  test("runs until its last day, or without end", () => {
    expect(membershipRuns({ membership_until: null }, "2026-10-11")).toBe(true)
    expect(membershipRuns({ membership_until: "2026-10-11" }, "2026-10-11")).toBe(true)
    expect(membershipRuns({ membership_until: "2026-10-10" }, "2026-10-11")).toBe(false)
  })
})
