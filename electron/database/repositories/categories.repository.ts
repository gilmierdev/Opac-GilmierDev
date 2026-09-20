import type { DB } from '../connection'
import { now, toBool } from './utils'
import type {
  Category,
  CategoryInput,
  CategoryListItem
} from '@shared/types'

const LIST_SELECT = `
  SELECT
    c.id,
    c.name,
    c.description,
    CAST(c.is_archived AS INTEGER) AS is_archived,
    c.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.category_id = c.id) AS book_count
  FROM categories c
`

export interface CategoriesRepository {
  list(includeArchived?: boolean): CategoryListItem[]
  getById(id: number): Category | null
  create(input: CategoryInput): CategoryListItem
  update(id: number, input: CategoryInput): CategoryListItem
  archive(id: number): CategoryListItem
}

export function categoriesRepository(db: DB): CategoriesRepository {
  const insertStmt = db.prepare(`
    INSERT INTO categories (name, description, created_at)
    VALUES (@name, @description, @created_at)
  `)
  const updateStmt = db.prepare(`
    UPDATE categories SET name = @name, description = @description WHERE id = @id
  `)
  const archiveStmt = db.prepare(`
    UPDATE categories SET is_archived = 1 WHERE id = ?
  `)
  const getByIdStmt = db.prepare(`
    SELECT id, name, description, CAST(is_archived AS INTEGER) AS is_archived, created_at
    FROM categories WHERE id = ?
  `)
  const getListItemStmt = db.prepare(`${LIST_SELECT} WHERE c.id = ?`)

  const map = (row: any): CategoryListItem => ({
    id: row.id,
    name: row.name,
    description: row.description,
    is_archived: toBool(row.is_archived),
    book_count: row.book_count ?? 0,
    created_at: row.created_at
  })

  return {
    list(includeArchived = false) {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY c.name COLLATE NOCASE`
        : `${LIST_SELECT} WHERE c.is_archived = 0 ORDER BY c.name COLLATE NOCASE`
      return (db.prepare(sql).all() as any[]).map(map)
    },
    getById(id) {
      const row = getByIdStmt.get(id)
      if (!row) return null
      return {
        id: (row as any).id,
        name: (row as any).name,
        description: (row as any).description,
        is_archived: toBool((row as any).is_archived),
        created_at: (row as any).created_at
      }
    },
    create(input) {
      const ts = now()
      const result = insertStmt.run({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        created_at: ts
      })
      return map(getListItemStmt.get(result.lastInsertRowid))
    },
    update(id, input) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Category not found')
      updateStmt.run({
        id,
        name: input.name.trim(),
        description: input.description?.trim() || null
      })
      return map(getListItemStmt.get(id))
    },
    archive(id) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Category not found')
      archiveStmt.run(id)
      return map(getListItemStmt.get(id))
    }
  }
}