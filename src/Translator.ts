import { parse } from "csv-parse/sync"

// The language is carried along, for the few places that need more than a text
export type Translator = ((key: string) => string) & { language?: string }

const translationsCSV = await Bun.file("./src/assets/translations.csv").text()

const translations = Object.fromEntries(
  parse(translationsCSV, {
    delimiter: ",",
    columns: true,
    skip_empty_lines: true,
    encoding: "utf8",
  }).map((row: Record<string, string>) => [row.key, row]),
)

export function useTranslator(lang: string): Translator {
  return Object.assign(
    (key: string) =>
      translations[key] && translations[key][lang] ? translations[key][lang] : key,
    { language: lang },
  )
}
