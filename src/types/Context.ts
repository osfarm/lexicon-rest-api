import type { Pool } from "pg"
import type { Translator } from "../Translator"
import type { OutputFormat } from "./OutputFormat"

export interface Context {
  path: string
  request: Request
  language: string
  params: Record<string, string>
  query: Record<string, string>
  t: Translator
  output: OutputFormat
  db: Pool
  dateTimeFormatter: {
    DateTime: (date: Date) => string
    Date: (date: Date) => string
  }
}
