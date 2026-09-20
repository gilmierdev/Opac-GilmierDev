import type { DB } from '../connection'
import { now, toBool } from './utils'
import type {
  Author,
  AuthorInput,
  AuthorListItem
} from '@shared/types'

const LIST_SELECT = `
  SELECT
    a.id,
    a.name,
    a.biography,
    CAST(a.is_archived AS INTEGER) AS is_archived,
    a.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.author_id = a.id) AS book_count
  FROM authors a
`

export interface AuthorsRepository {
  list(includeArchived?: boolean): AuthorListItem[]
  getById(id: number): Author | null
  create(input: AuthorInput): AuthorListItem
  update(id: number, input: AuthorInput): AuthorListItem
  archive(id: number): AuthorListItem
}

export function authorsRepository(db: DB): AuthorsRepository {
  const insertStmt = db.prepare(`
    INSERT INTO authors (name, biography, created_at)
    VALUES (@name, @biography, @created_at)
  `)
  const updateStmt = db.prepare(`
    UPDATE authors SET name = @name, biography = @biography WHERE id = @id
  `)
  const archiveStmt = db.prepare(`
    UPDATE authors SET is_archived = 1 WHERE id = ?
  `)
  const getByIdStmt = db.prepare(`
    SELECT id, name, biography, CAST(is_archived AS INTEGER) AS is_archived, created_at
    FROM authors WHERE id = ?
  `)
  const getListItemStmt = db.prepare(`${LIST_SELECT} WHERE a.id = ?`)

  const map = (row: any): AuthorListItem => ({
    id: row.id,
    name: row.name,
    biography: row.biography,
    is_archived: toBool(row.is_archived),
    book_count: row.book_count ?? 0,
    created_at: row.created_at
  })

  return {
    list(includeArchived = false) {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY a.name COLLATE NOCASE`
        : `${LIST_SELECT} WHERE a.is_archived = 0 ORDER BY a.name COLLATE NOCASE`
      return (db.prepare(sql).all() as any[]).map(map)
    },
    getById(id) {
      const row = getByIdStmt.get(id)
      if (!row) return null
      return {
        id: (row as any).id,
        name: (row as any).name,
        biography: (row as any).biography,
        is_archived: toBool((row as any).is_archived),
        created_at: (row as any).created_at
      }
    },
    create(input) {
      const ts = now()
      const result = insertStmt.run({
        name: input.name.trim(),
        biography: input.biography?.trim() || null,
        created_at: ts
      })
      return map(getListItemStmt.get(result.lastInsertRowid))
    },
    update(id, input) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Author not found')
      updateStmt.run({
        id,
        name: input.name.trim(),
        biography: input.biography?.trim() || null
      })
      return map(getListItemStmt.get(id))
    },
    archive(id) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Author not found')
      archiveStmt.run(id)
      return map(getListItemStmt.get(id))
    }
  }
}