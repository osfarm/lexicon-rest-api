import { randomBytes } from "node:crypto"
import type { Pool } from "pg"
import { ACCESS_SCHEMA } from "../access/Schema"
import type { Criteria, FeatureCollection, Kind } from "./Collect"

export const MAXIMUM_COLLECTIONS = 50
export const MAXIMUM_NAME_LENGTH = 80

const SHARE_ID = /^[A-Za-z0-9_-]{22}$/

type Db = Pick<Pool, "query">

export type Collection = Readonly<{
  id: string
  member_id: string
  name: string
  kind: Kind
  criteria: Criteria
  datasets: string[]
  features: number
  collected_at: Date
  updated_at: Date
  share_id: string | null
  shared_at: Date | null
  // Who gathered it, for the page anyone reads a shared collection at
  owner?: string
}>

const table = (name: string) => `"${ACCESS_SCHEMA}".${name}`

const COLUMNS = `c.id::text, c.member_id::text, c.name, c.kind, c.criteria, c.datasets, c.features,
  c.collected_at, c.updated_at, c.share_id, c.shared_at`

const isId = (id: string) => /^\d{1,18}$/.test(id)

export const isShareId = (id: string) => SHARE_ID.test(id)

export async function listCollections(db: Db, memberId: string): Promise<Collection[]> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM ${table("collections")} AS c WHERE c.member_id = $1 ORDER BY c.updated_at DESC;`,
    [memberId],
  )

  return result.rows
}

export async function countCollections(db: Db, memberId: string): Promise<number> {
  const result = await db.query(
    `SELECT count(*)::integer AS count FROM ${table("collections")} WHERE member_id = $1;`,
    [memberId],
  )

  return result.rows[0].count
}

/**
 * A collection of the member. The one of another member is as unknown as one that does not exist.
 */
export async function findCollection(
  db: Db,
  memberId: string,
  id: string,
): Promise<Collection | undefined> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM ${table("collections")} AS c WHERE c.id = $1 AND c.member_id = $2;`,
    [isId(id) ? id : null, memberId],
  )

  return result.rows[0]
}

export async function documentOf(db: Db, collection: Collection): Promise<FeatureCollection> {
  const result = await db.query(
    `SELECT document FROM ${table("collections")} WHERE id = $1;`,
    [collection.id],
  )

  return result.rows[0].document
}

/**
 * @returns the identifier of the new collection, undefined when the member holds as many as allowed
 */
export async function createCollection(
  db: Db,
  memberId: string,
  input: {
    name: string
    criteria: Criteria
    datasets: readonly string[]
    document: FeatureCollection
  },
): Promise<string | undefined> {
  const created = await db.query(
    `INSERT INTO ${table("collections")} (member_id, name, kind, criteria, datasets, features, document)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE (SELECT count(*) FROM ${table("collections")} WHERE member_id = $1) < $8
     RETURNING id::text;`,
    [
      memberId,
      input.name,
      input.criteria.kind,
      JSON.stringify(input.criteria),
      input.datasets,
      input.document.features.length,
      JSON.stringify(input.document),
      MAXIMUM_COLLECTIONS,
    ],
  )

  return created.rows[0]?.id
}

export async function duplicateCollection(db: Db, collection: Collection, name: string) {
  const created = await db.query(
    `INSERT INTO ${table("collections")} (member_id, name, kind, criteria, datasets, features, document, collected_at)
     SELECT member_id, $2, kind, criteria, datasets, features, document, collected_at
       FROM ${table("collections")} AS c
      WHERE c.id = $1 AND (SELECT count(*) FROM ${table("collections")} WHERE member_id = c.member_id) < $3
     RETURNING id::text;`,
    [collection.id, name, MAXIMUM_COLLECTIONS],
  )

  return created.rows[0]?.id as string | undefined
}

export async function saveDocument(db: Db, collection: Collection, document: FeatureCollection) {
  await db.query(
    `UPDATE ${table("collections")} SET document = $2, features = $3, updated_at = now() WHERE id = $1;`,
    [collection.id, JSON.stringify(document), document.features.length],
  )
}

export async function renameCollection(db: Db, collection: Collection, name: string) {
  await db.query(
    `UPDATE ${table("collections")} SET name = $2, updated_at = now() WHERE id = $1;`,
    [collection.id, name],
  )
}

export async function deleteCollection(db: Db, collection: Collection) {
  await db.query(`DELETE FROM ${table("collections")} WHERE id = $1;`, [collection.id])
}

/**
 * Gives the collection an address anyone can read it at. The address cannot be
 * guessed, and stays the same until the member stops sharing.
 */
export async function shareCollection(db: Db, collection: Collection) {
  await db.query(
    `UPDATE ${table("collections")} SET share_id = $2, shared_at = now() WHERE id = $1 AND share_id IS NULL;`,
    [collection.id, randomBytes(16).toString("base64url")],
  )
}

/**
 * Stops sharing: the address stops working, and sharing again gives another one.
 */
export async function unshareCollection(db: Db, collection: Collection) {
  await db.query(
    `UPDATE ${table("collections")} SET share_id = NULL, shared_at = NULL WHERE id = $1;`,
    [collection.id],
  )
}

/**
 * The collection shared at an address, while its member's account is open.
 */
export async function findSharedCollection(
  db: Db,
  shareId: string,
): Promise<Collection | undefined> {
  const result = await db.query(
    `SELECT ${COLUMNS}, m.name AS owner
       FROM ${table("collections")} AS c
       JOIN ${table("members")} AS m ON m.id = c.member_id
      WHERE c.share_id = $1 AND m.disabled_at IS NULL;`,
    [isShareId(shareId) ? shareId : null],
  )

  return result.rows[0]
}
