import type { Pool } from "pg"
import { Err, match, Ok, type AsyncResult, type Result } from "shulk"
import { ObjectMap } from "./utils"
import { NotFound } from "./types/HTTPErrors"

const DB_SCHEMA = import.meta.env.DB_SCHEMA

type TableDefinition<T extends object> = {
  table: string
  primaryKey: keyof T
  // map: Record<keyof T, string>
  oneToOne?: {
    [x in keyof T]?: TableDefinition<T>
  }
  geometry?: (keyof T)[]
}

export function Table<T extends object>(definition: TableDefinition<T>) {
  return (db: Pool) => ({
    select: () => new Select(db, definition),

    read: async (key: string): AsyncResult<NotFound | Error, T> => {
      const result = await new Select(db, definition)
        .where(definition.primaryKey, "=", key)
        .limit(1)
        .run()

      return result
        .map((rows) => rows[0])
        .flatMap(
          (maybeRow): Result<NotFound, T> =>
            maybeRow !== undefined ? Ok(maybeRow) : Err(new NotFound())
        )
    },

    example: () => db.query(`SELECT * FROM "${DB_SCHEMA}".${definition.table} LIMIT 1;`),
  })
}

type Operator = "=" | ">" | ">=" | "<" | "<=" | "LIKE" | "ST_WITHIN"
type Condition<T> = {
  field: keyof T
  op: Operator
  value: unknown
  or: []
}

class Select<T extends object> {
  protected conditions: Condition<T>[]
  protected orders: { field: keyof T; sort: "ASC" | "DESC" }[] = []
  protected limitValue?: number
  protected offsetValue: number = 0

  constructor(protected db: Pool, protected def: TableDefinition<T>) {
    this.conditions = []
  }

  where(field: keyof T, op: Operator, value: unknown) {
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

  protected makeCondition(condition: Condition<T>, i: number) {
    const field = String(condition.field)

    return match(condition.op).case({
      ST_WITHIN: () =>
        `postgis.ST_Within(${field}, postgis.ST_GeomFromGeoJSON($${i + 1}))`,
      _otherwise: () => `${field} ${condition.op} $${i + 1}`,
    })
  }

  protected prepareConditionsAndParams() {
    const conditions =
      this.conditions.length > 0
        ? `WHERE ${this.conditions.map(this.makeCondition).join(" AND ")}`
        : ""

    const params = this.conditions.flatMap((condition) =>
      match(condition.op).case({
        ST_WITHIN: () => [JSON.stringify(condition.value)],
        _otherwise: () => [condition.value],
      })
    )

    console.log(params)

    return { conditions, params }
  }

  async run(): AsyncResult<Error, T[]> {
    const db = this.db

    const { conditions, params } = this.prepareConditionsAndParams()

    try {
      const tableName = `"${DB_SCHEMA}".${this.def.table}`

      const fields = this.def.geometry
        ? "*, " +
          this.def.geometry
            ?.map(
              (field) => `postgis.ST_AsGeoJSON(${field as string}) AS ${field as string}`
            )
            .join(", ")
        : "*"

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

      const q = `SELECT ${fields} FROM ${tableName} ${joints} ${conditions} ${sortings} ${limit} ${offset};`

      console.log(q)
      const response = await db.query(q, params)

      const parsedResponse = response.rows.map((row) =>
        ObjectMap(row, (key, value) =>
          this.def.geometry && this.def.geometry.includes(key as any)
            ? JSON.parse(value)
            : value
        )
      )

      /*response.rows.map((row) =>
        Object.fromEntries(
          Object.entries(this.def.map).map(([field, column]) => [
            field,
            row[column as string],
          ])
        )
      )*/

      if (!import.meta.env.PRODUCTION) {
        console.debug(parsedResponse[0])
      }

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
}

export type t_Select<T extends object> = Select<T>
