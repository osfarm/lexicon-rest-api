import type { Pool } from "pg"
import { Err, match, Ok, type AsyncResult, type Result } from "shulk"
import { ObjectMap } from "./utils"
import { NotFound } from "./types/HTTPErrors"
import { Cache } from "./Cache"

const hasher = new Bun.CryptoHasher("sha256")
const hash = (str: string) => hasher.update(str).digest("base64")

const DB_SCHEMA = import.meta.env.DB_SCHEMA

const MAX_CACHE_ITEMS = 1000
const ONE_DAY_IN_MS = 86400000

const cache = new Cache({ max: MAX_CACHE_ITEMS })

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

type Operator = "=" | ">" | ">=" | "<" | "<=" | "LIKE" | "ST_WITHIN" | "ST_CONTAINS"
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
      ST_CONTAINS: () =>
        `postgis.ST_Contains(${field}, postgis.ST_GeomFromGeoJSON($${i + 1}))`,
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
        ST_CONTAINS: () => [JSON.stringify(condition.value)],
        _otherwise: () => [condition.value],
      })
    )

    return { conditions, params }
  }

  async run(): AsyncResult<Error, T[]> {
    const db = this.db

    const { conditions, params } = this.prepareConditionsAndParams()

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

    const queryHash = hash(q + "-" + params.toString())

    const maybeCached = cache.retrieve(queryHash)

    return match(maybeCached).case({
      Some: async ({ val }) => Ok(val),
      None: async () => {
        try {
          const response = await db.query(q, params)

          const parsedResponse = response.rows.map((row) =>
            ObjectMap(row, (key, value) =>
              this.def.geometry && this.def.geometry.includes(key as any)
                ? JSON.parse(value)
                : value
            )
          )

          if (!import.meta.env.PRODUCTION) {
            //    console.debug(parsedResponse[0])
          }

          cache.save(queryHash, parsedResponse, ONE_DAY_IN_MS)

          return Ok(parsedResponse as T[])
        } catch (e) {
          return Err(e as Error)
        }
      },
    })
  }

  async count(): AsyncResult<Error, number> {
    const db = this.db

    const { conditions, params } = this.prepareConditionsAndParams()

    const q = `SELECT COUNT(*) FROM "${DB_SCHEMA}".${this.def.table} ${conditions};`

    const queryHash = hash(q + "-" + params.toString())

    const maybeCached = cache.retrieve(queryHash)

    return match(maybeCached).case({
      Some: async ({ val }) => Ok(val),
      None: async () => {
        try {
          const response = await db.query(q, params)

          const parsedResponse = parseInt(response.rows[0].count)

          cache.save(queryHash, parsedResponse, ONE_DAY_IN_MS)

          return Ok(parsedResponse)
        } catch (e) {
          return Err(e as Error)
        }
      },
    })
  }
}

export type t_Select<T extends object> = Select<T>
