import { describe, expect, test } from "bun:test"
import { FILE_ANSWERS, NOTES, SHEET_ANSWERS } from "../contribute/Guide"
import { useTranslator } from "../Translator"
import { ContributePage } from "./Contribute"

describe("the guide of ./lexicon contribute", () => {
  const page = String(ContributePage({ t: useTranslator("fr") }))

  test("walks through the five steps", () => {
    for (const anchor of ["installer", "tableau", "fiche", "verifier", "proposer"]) {
      expect(page).toContain(`href="#${anchor}"`)
      expect(page).toContain(`id="${anchor}"`)
    }
  })

  test("gives a remedy for every answer of the command", () => {
    for (const answer of [...SHEET_ANSWERS, ...FILE_ANSWERS, ...NOTES]) {
      expect(answer.remedy.length).toBeGreaterThan(0)
      expect(page).toContain(Bun.escapeHTML(answer.remedy))
    }
  })

  test("is titled in the language of the reader", () => {
    expect(page).toContain("<h1>Proposer un jeu de données</h1>")
    expect(String(ContributePage({ t: useTranslator("en") }))).toContain(
      "<h1>Propose a dataset</h1>",
    )
  })
})
