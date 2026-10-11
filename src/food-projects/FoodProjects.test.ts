import { describe, expect, test } from "bun:test"
import { foodProjectOf } from "./FoodProjects"

const row = {
  id: 891,
  name: "PAAT de Redon Agglomération",
  usual_name: null,
  label_level: 2,
  labelled_in: 2024,
  holder: "REDON Agglomération",
  holder_kind: "Intercommunalité",
  themes: ["food_economy", "environment"],
  communes_count: 31,
  sheet_url: "https://france-pat.fr/pat/redon-agglomeration/",
  website: null,
  farms_count: 729,
  organic_farmland_share: "20.69",
}

describe("foodProjectOf", () => {
  test("a project is called by its usual name, its administrative one otherwise", () => {
    expect(foodProjectOf(row).name).toBe("PAAT de Redon Agglomération")
    expect(foodProjectOf({ ...row, usual_name: "Programme de Redon" }).name).toBe(
      "Programme de Redon",
    )
  })

  test("a pending recognition has no level", () => {
    expect(foodProjectOf({ ...row, label_level: null })["label-level"]).toBeUndefined()
  })

  test("a commune that comes by a co-holder says which", () => {
    const project = foodProjectOf({
      ...row,
      co_holders: ["Communauté de communes Coeur de Saintonge"],
      through: "Communauté de communes Coeur de Saintonge",
    })

    expect(project.through).toBe("Communauté de communes Coeur de Saintonge")
    expect(foodProjectOf({ ...row, co_holders: [] })["co-holders"]).toBeUndefined()
  })

  test("a share comes as a number", () => {
    expect(foodProjectOf(row)["organic-farmland-share"]).toBe(20.69)
  })
})
