import type { Pool } from "pg"

const DEFAULT_COLOR = "#999999"
const DB_SCHEMA = import.meta.env.DB_SCHEMA

// Parse colors.yml — flat `name: Color` lines under `varieties:`.
const yamlText = await Bun.file("./src/assets/colors.yml").text()
const colors: Record<string, string> = {}
for (const m of yamlText.matchAll(/^\s+([a-z_]+):\s+(\w+)\s*$/gm)) {
  colors[m[1]] = m[2]
}

export function colorForSpecie(specie: string | undefined | null): string {
  if (!specie) return DEFAULT_COLOR
  const parts = specie.split("_")
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join("_")
    if (colors[candidate]) return colors[candidate]
  }
  return DEFAULT_COLOR
}

export async function resolveCapCodeSpecies(
  db: Pool,
  capCodes: string[],
  year: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (capCodes.length === 0) return out
  const placeholders = capCodes.map((_, i) => `$${i + 2}`).join(", ")
  const q = `
    SELECT mcpc.cap_code, mp.specie
    FROM "${DB_SCHEMA}".master_crop_production_cap_codes mcpc
    LEFT JOIN "${DB_SCHEMA}".master_productions mp
      ON mp.reference_name = mcpc.production
    WHERE mcpc.year = $1
      AND mcpc.cap_code IN (${placeholders})
  `
  const result = await db.query(q, [year, ...capCodes])
  for (const row of result.rows) {
    if (row.specie && !out.has(row.cap_code)) {
      out.set(row.cap_code, row.specie)
    }
  }
  return out
}

export async function resolveCapCodeColors(
  db: Pool,
  capCodes: string[],
  year: number,
): Promise<Map<string, string>> {
  const species = await resolveCapCodeSpecies(db, capCodes, year)
  const out = new Map<string, string>()
  for (const code of capCodes) {
    out.set(code, colorForSpecie(species.get(code)))
  }
  return out
}

export const cropColorPaletteSize = Object.keys(colors).length
