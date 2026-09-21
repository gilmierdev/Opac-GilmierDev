import type { Db } from '../client'
import { toIso, toBool, toInt } from './utils'
import type { Category, CategoryInput, CategoryListItem } from '@shared/types'

const LIST_SELECT = `
  SELECT
    c.id,
    c.name,
    c.description,
    c.is_archived,
    c.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.category_id = c.id)::int AS book_count
  FROM categories c
`

interface CategoryRow {
  id: number | string
  name: string
  description: string | null
  is_archived: boolean
  created_at: Date | string
  book_count: number | string
}

export interface CategoriesRepository {
  list(includeArchived?: boolean): Promise<CategoryListItem[]>
  getById(id: number): Promise<Category | null>
  create(input: CategoryInput): Promise<CategoryListItem>
  update(id: number, input: CategoryInput): Promise<CategoryListItem>
  archive(id: number): Promise<CategoryListItem>
}

function map(row: CategoryRow): CategoryListItem {
  return {
    id: toInt(row.id),
    name: row.name,
    description: row.description,
    is_archived: toBool(row.is_archived),
    book_count: toInt(row.book_count),
    created_at: toIso(row.created_at)
  }
}

export function categoriesRepository(db: Db): CategoriesRepository {
  const getListItem = async (id: number): Promise<CategoryListItem | null> => {
    const row = await db.one<CategoryRow>(`${LIST_SELECT} WHERE c.id = $1`, [id])
    return row ? map(row) : null
  }

  return {
    async list(includeArchived = false): Promise<CategoryListItem[]> {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY lower(c.name) ASC, c.id ASC`
        : `${LIST_SELECT} WHERE c.is_archived = FALSE ORDER BY lower(c.name) ASC, c.id ASC`
      const rows = await db.many<CategoryRow>(sql)
      return rows.map(map)
    },
    async getById(id: number): Promise<Category | null> {
      const row = await db.one<CategoryRow>(
        'SELECT id, name, description, is_archived, created_at FROM categories WHERE id = $1',
        [id]
      )
      if (!row) return null
      return {
        id: toInt(row.id),
        name: row.name,
        description: row.description,
        is_archived: toBool(row.is_archived),
        created_at: toIso(row.created_at)
      }
    },
    async create(input: CategoryInput): Promise<CategoryListItem> {
      const inserted = await db.one<{ id: number }>(
        'INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3) RETURNING id',
        [input.name.trim(), input.description?.trim() || null, new Date().toISOString()]
      )
      if (!inserted) throw new Error('Failed to create category')
      const item = await getListItem(toInt(inserted.id))
      if (!item) throw new Error('Failed to create category')
      return item
    },
    async update(id: number, input: CategoryInput): Promise<CategoryListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Category not found')
      await db.query('UPDATE categories SET name = $1, description = $2 WHERE id = $3', [
        input.name.trim(),
        input.description?.trim() || null,
        id
      ])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to update category')
      return item
    },
    async archive(id: number): Promise<CategoryListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Category not found')
      await db.query('UPDATE categories SET is_archived = TRUE WHERE id = $1', [id])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to archive category')
      return item
    }
  }
}