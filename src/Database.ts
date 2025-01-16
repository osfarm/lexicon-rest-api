import type postgres from "postgres"
import { Err, Ok, type AsyncResult } from "shulk"

type TableDefinition<T extends object> = {
  table: string
  primaryKey: keyof T
  map: Record<keyof T, string>
}

export function Table<T extends object>(definition: TableDefinition<T>) {
  return (db: postgres.Sql<{}>) => ({
    select: () => new Select(db, definition),
  })
}

class Select<T extends object> {
  protected conditions: { field: keyof T; op: "="; value: unknown; or: [] }[]
  protected orders: { field: keyof T; sort: "ASC" | "DESC" }[] = []
  protected limitValue?: number
  protected offsetValue: number = 0

  constructor(
    protected db: postgres.Sql<{}>,
    protected def: TableDefinition<T>
  ) {
    this.conditions = []
  }

  where(field: keyof T, op: "=", value: unknown) {
    this.conditions.push({ field, op, value, or: [] })
    return this
  }

  orderBy(field: keyof T, sort: "ASC" | "DESC") {
    this.orders.push({ field, sort })
    return this
  }

  limit(limit: number) {
    this.limitValue = limit
    return this
  }

  offset(offset: number) {
    this.offsetValue = offset
    return this
  }

  async run(): AsyncResult<Error, T[]> {
    const sql = this.db

    const conditionsQuery =
      this.conditions.length > 0
        ? `WHERE ${this.conditions
            .map((_, i) => "?" + (i + 1) + "=?" + (i + 2))
            .join(" AND ")}`
        : ""

    try {
      //   const fields = sql`${Object.entries(this.def.map)
      //     .map(([field, tableProp]) => `${tableProp} AS ${field}`)
      //     .join(", ")}`

      //console.log(orders)

      const response = await sql`SELECT * FROM ${sql(
        "lexicon__6_0_0-ekyviti"
      )}.${sql(this.def.table)} ${sql`ORDER BY ${this.orders.map(
        (order) =>
          sql`${sql(this.def.map[order.field])} ${
            order.sort === "ASC" ? sql`ASC` : sql`DESC`
          }`
      )}`} ${
        this.limitValue ? sql`LIMIT ${this.limitValue}` : sql``
      } ${sql`OFFSET ${this.offsetValue}`};`

      console.log(response.statement)

      const parsedResponse = response.map((row) =>
        Object.fromEntries(
          Object.entries(this.def.map).map(([field, column]) => [
            field,
            row[column],
          ])
        )
      )
      console.log(parsedResponse[0])

      return Ok(parsedResponse as T[])
    } catch (e) {
      return Err(e as Error)
    }
  }

  async count(): AsyncResult<Error, number> {
    const sql = this.db

    const conditionsQuery =
      this.conditions.length > 0
        ? `WHERE ${this.conditions
            .map((_, i) => "?" + (i + 1) + "=?" + (i + 2))
            .join(" AND ")}`
        : ""

    try {
      const response = await sql`SELECT COUNT(*) FROM ${sql(
        "lexicon__6_0_0-ekyviti"
      )}.${sql(this.def.table)};`

      return Ok(parseInt(response[0].count))
    } catch (e) {
      return Err(e as Error)
    }
  }
}
