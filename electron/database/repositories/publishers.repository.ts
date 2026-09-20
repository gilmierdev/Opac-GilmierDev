import type { DB } from '../connection'
import { now, toBool } from './utils'
import type {
  Publisher,
  PublisherInput,
  PublisherListItem
} from '@shared/types'

const LIST_SELECT = `
  SELECT
    p.id,
    p.name,
    p.address,
    p.website,
    CAST(p.is_archived AS INTEGER) AS is_archived,
    p.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.publisher_id = p.id) AS book_count
  FROM publishers p
`

export interface PublishersRepository {
  list(includeArchived?: boolean): PublisherListItem[]
  getById(id: number): Publisher | null
  create(input: PublisherInput): PublisherListItem
  update(id: number, input: PublisherInput): PublisherListItem
  archive(id: number): PublisherListItem
}

export function publishersRepository(db: DB): PublishersRepository {
  const insertStmt = db.prepare(`
    INSERT INTO publishers (name, address, website, created_at)
    VALUES (@name, @address, @website, @created_at)
  `)
  const updateStmt = db.prepare(`
    UPDATE publishers SET name = @name, address = @address, website = @website WHERE id = @id
  `)
  const archiveStmt = db.prepare(`
    UPDATE publishers SET is_archived = 1 WHERE id = ?
  `)
  const getByIdStmt = db.prepare(`
    SELECT id, name, address, website, CAST(is_archived AS INTEGER) AS is_archived, created_at
    FROM publishers WHERE id = ?
  `)
  const getListItemStmt = db.prepare(`${LIST_SELECT} WHERE p.id = ?`)

  const map = (row: any): PublisherListItem => ({
    id: row.id,
    name: row.name,
    address: row.address,
    website: row.website,
    is_archived: toBool(row.is_archived),
    book_count: row.book_count ?? 0,
    created_at: row.created_at
  })

  return {
    list(includeArchived = false) {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY p.name COLLATE NOCASE`
        : `${LIST_SELECT} WHERE p.is_archived = 0 ORDER BY p.name COLLATE NOCASE`
      return (db.prepare(sql).all() as any[]).map(map)
    },
    getById(id) {
      const row = getByIdStmt.get(id)
      if (!row) return null
      return {
        id: (row as any).id,
        name: (row as any).name,
        address: (row as any).address,
        website: (row as any).website,
        is_archived: toBool((row as any).is_archived),
        created_at: (row as any).created_at
      }
    },
    create(input) {
      const ts = now()
      const result = insertStmt.run({
        name: input.name.trim(),
        address: input.address?.trim() || null,
        website: input.website?.trim() || null,
        created_at: ts
      })
      return map(getListItemStmt.get(result.lastInsertRowid))
    },
    update(id, input) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Publisher not found')
      updateStmt.run({
        id,
        name: input.name.trim(),
        address: input.address?.trim() || null,
        website: input.website?.trim() || null
      })
      return map(getListItemStmt.get(id))
    },
    archive(id) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Publisher not found')
      archiveStmt.run(id)
      return map(getListItemStmt.get(id))
    }
  }
}