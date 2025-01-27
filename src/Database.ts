import type { Client } from "pg"
import { Err, Ok, type AsyncResult } from "shulk"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type TableDefinition<T extends object> = {
  table: string
  primaryKey: keyof T
  // map: Record<keyof T, string>
  oneToOne?: {
    [x in keyof T]?: TableDefinition<T>
  }
}

export function Table<T extends object>(definition: TableDefinition<T>) {
  return (db: Client) => ({
    select: () => new Select(db, definition),
    example: () =>
      db.query(`SELECT * FROM "${DB_SCHEMA}".${definition.table} LIMIT 1;`),
  })
}

class Select<T extends object> {
  protected conditions: { field: keyof T; op: "="; value: unknown; or: [] }[]
  protected orders: { field: keyof T; sort: "ASC" | "DESC" }[] = []
  protected limitValue?: number
  protected offsetValue: number = 0

  constructor(protected db: Client, protected def: TableDefinition<T>) {
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

  protected prepareConditionsAndParams() {
    const conditions =
      this.conditions.length > 0
        ? `WHERE ${this.conditions
            .map((condition, i) => (condition.field as string) + "=$" + (i + 1))
            .join(" AND ")}`
        : ""

    const params = this.conditions.flatMap((condition) => [condition.value])

    return { conditions, params }
  }

  async run(): AsyncResult<Error, T[]> {
    const db = this.db

    const { conditions, params } = this.prepareConditionsAndParams()

    try {
      //   const q = `SELECT * FROM "${DB_SCHEMA}".${this.def.table} ${conditions} ${
      //     this.orders.length > 0
      //       ? `ORDER BY ${this.orders.map(
      //           (order) => `${this.def.map[order.field]} ${order.sort}`
      //         )}`
      //       : ``
      //   } ${this.limitValue ? `LIMIT ${this.limitValue}` : ``} ${
      //     this.offsetValue ? `OFFSET ${this.offsetValue}` : ``
      //   };`

      const tableName = `"${DB_SCHEMA}".${this.def.table}`

      const sortings =
        this.orders.length > 0
          ? `ORDER BY ${this.orders.map(
              (order) => `${order.field as string} ${order.sort}`
            )}`
          : ``

      const joints = this.def.oneToOne
        ? Object.entries(this.def.oneToOne)
            .filter(([, value]) => value !== undefined)
            .map(
              ([prop, subdef]) =>
                // @ts-ignore
                `LEFT JOIN "${DB_SCHEMA}".${subdef.table} ON ${this.def.table}.${prop}=${subdef.table}.${subdef.primaryKey}`
            )
            .join(" ")
        : ``

      const limit = this.limitValue ? `LIMIT ${this.limitValue}` : ``
      const offset = this.offsetValue ? `OFFSET ${this.offsetValue}` : ``

      const q = `SELECT * FROM ${tableName} ${joints} ${conditions} ${sortings} ${limit} ${offset};`

      const response = await db.query(q, params)

      const parsedResponse = response.rows

      /*response.rows.map((row) =>
        Object.fromEntries(
          Object.entries(this.def.map).map(([field, column]) => [
            field,
            row[column as string],
          ])
        )
      )*/
      console.log(parsedResponse[0])

      return Ok(parsedResponse as T[])
    } catch (e) {
      return Err(e as Error)
    }
  }

  async count(): AsyncResult<Error, number> {
    const db = this.db

    const { conditions, params } = this.prepareConditionsAndParams()

    try {
      const response = await db.query(
        `SELECT COUNT(*) FROM "${DB_SCHEMA}".${this.def.table} ${conditions};`,
        params
      )

      return Ok(parseInt(response.rows[0].count))
    } catch (e) {
      return Err(e as Error)
    }
  }

  //   async credits(): AsyncResult<Error, Credit | undefined> {
  //     const db = this.db

  //     try {
  //       const response = await db.query(
  //         `SELECT * FROM "${DB_SCHEMA}".datasource_credits WHERE datasource LIKE '%${this.def.table}';`
  //       )

  //       return Ok(response.rows[0])
  //     } catch (e) {
  //       return Err(e as Error)
  //     }
  //   }
}

interface Credit {
  datasource: string
  name: string
  url: string
  provider: string
  licence?: string
  licence_url: string
  updated_at: Date
}

export type t_Select<T extends object> = Select<T>
