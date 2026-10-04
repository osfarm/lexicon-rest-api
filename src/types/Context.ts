import type { Pool } from "pg"
import type { Translator } from "../Translator"
import type { OutputFormat } from "./OutputFormat"
import type { Identity } from "../access/AccessControl"

export interface Context {
  path: string
  request: Request
  language: string
  params: Record<string, string>
  query: Record<string, string>
  t: Translator
  output: OutputFormat
  db: Pool
  // Who is calling, and what their plan lets them read
  identity: Identity
  dateTimeFormatter: {
    DateTime: (date: Date) => string
    Date: (date: Date) => string
  }
  numberFormatter: (number: number) => string
}
