import type { Pool } from "pg"

// Territorial food projects (projets alimentaires territoriaux, PAT) of the
// observatory France PAT: which ones cover a commune.

const SCHEMA = import.meta.env.DB_SCHEMA
const table = (name: string) => `"${SCHEMA}".${name}`

export const FOOD_PROJECT_THEMES = [
  "food_economy",
  "culture_and_gastronomy",
  "food_education",
  "nutrition_and_health",
  "social_justice",
  "environment",
  "collective_catering",
  "town_planning",
  "governance",
  "other",
]

export type FoodProject = Readonly<{
  id: number
  name: string
  // 1 or 2; absent while the recognition is pending
  "label-level"?: number
  "labelled-in"?: number
  holder?: string
  "holder-kind"?: string
  // Those who lead the project beside its holder
  "co-holders"?: string[]
  // The co-holder the commune comes by, when the sheet of the project does not list the commune itself
  through?: string
  themes: string[]
  communes: number
  // The sheet of the project on france-pat.fr, and its own site
  "sheet-url"?: string
  website?: string
  // Figures of the whole territory of the project, not of the commune
  farms?: number
  "organic-farmland-share"?: number
}>

type Row = {
  id: number
  name: string
  usual_name: string | null
  label_level: number | null
  labelled_in: number | null
  holder: string | null
  holder_kind: string | null
  co_holders?: string[] | null
  through?: string | null
  themes: string[]
  communes_count: number
  sheet_url: string | null
  website: string | null
  farms_count: number | null
  organic_farmland_share: string | null
}

export const foodProjectOf = (row: Row): FoodProject => ({
  id: row.id,
  name: row.usual_name ?? row.name,
  "label-level": row.label_level ?? undefined,
  "labelled-in": row.labelled_in ?? undefined,
  holder: row.holder ?? undefined,
  "holder-kind": row.holder_kind ?? undefined,
  "co-holders": row.co_holders && row.co_holders.length > 0 ? row.co_holders : undefined,
  through: row.through ?? undefined,
  themes: row.themes ?? [],
  communes: row.communes_count,
  "sheet-url": row.sheet_url ?? undefined,
  website: row.website ?? undefined,
  farms: row.farms_count ?? undefined,
  "organic-farmland-share":
    row.organic_farmland_share === null ? undefined : Number(row.organic_farmland_share),
})

/**
 * The food projects covering a commune, the smallest territory first: a commune
 * is often in the project of its intercommunality and in the one of its department.
 * An empty list when none covers it; undefined when the projects are not in service.
 */
export function foodProjectsOf(db: Pool, inseeCode: string): Promise<FoodProject[] | undefined> {
  // to_jsonb reads the co-holders whether or not the package in service has them yet
  return db
    .query(
      `SELECT p.id, p.name, p.usual_name, p.label_level, p.labelled_in, p.holder, p.holder_kind,
         ARRAY(SELECT jsonb_array_elements_text(COALESCE(to_jsonb(p) -> 'co_holders', '[]'))) AS co_holders,
         to_jsonb(c) ->> 'through' AS through,
         p.themes, p.communes_count, p.sheet_url, p.website, p.farms_count, p.organic_farmland_share
       FROM ${table("registered_territorial_food_projects")} p
       JOIN ${table("registered_territorial_food_project_communes")} c ON c.project_id = p.id
       WHERE c.insee_code = $1
       ORDER BY p.communes_count, p.id;`,
      [inseeCode],
    )
    .then((result) => (result.rows as Row[]).map(foodProjectOf))
    .catch(() => undefined)
}
