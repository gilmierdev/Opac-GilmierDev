import type { Db } from '../client'
import { toIso, toBool, toInt } from './utils'
import type { Author, AuthorInput, AuthorListItem } from '@shared/types'

const LIST_SELECT = `
  SELECT
    a.id,
    a.name,
    a.biography,
    a.is_archived,
    a.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.author_id = a.id)::int AS book_count
  FROM authors a
`

interface AuthorRow {
  id: number | string
  name: string
  biography: string | null
  is_archived: boolean
  created_at: Date | string
  book_count: number | string
}

export interface AuthorsRepository {
  list(includeArchived?: boolean): Promise<AuthorListItem[]>
  getById(id: number): Promise<Author | null>
  create(input: AuthorInput): Promise<AuthorListItem>
  update(id: number, input: AuthorInput): Promise<AuthorListItem>
  archive(id: number): Promise<AuthorListItem>
}

function map(row: AuthorRow): AuthorListItem {
  return {
    id: toInt(row.id),
    name: row.name,
    biography: row.biography,
    is_archived: toBool(row.is_archived),
    book_count: toInt(row.book_count),
    created_at: toIso(row.created_at)
  }
}

export function authorsRepository(db: Db): AuthorsRepository {
  const getListItem = async (id: number): Promise<AuthorListItem | null> => {
    const row = await db.one<AuthorRow>(`${LIST_SELECT} WHERE a.id = $1`, [id])
    return row ? map(row) : null
  }

  return {
    async list(includeArchived = false): Promise<AuthorListItem[]> {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY lower(a.name) ASC, a.id ASC`
        : `${LIST_SELECT} WHERE a.is_archived = FALSE ORDER BY lower(a.name) ASC, a.id ASC`
      const rows = await db.many<AuthorRow>(sql)
      return rows.map(map)
    },
    async getById(id: number): Promise<Author | null> {
      const row = await db.one<AuthorRow>(
        'SELECT id, name, biography, is_archived, created_at FROM authors WHERE id = $1',
        [id]
      )
      if (!row) return null
      return {
        id: toInt(row.id),
        name: row.name,
        biography: row.biography,
        is_archived: toBool(row.is_archived),
        created_at: toIso(row.created_at)
      }
    },
    async create(input: AuthorInput): Promise<AuthorListItem> {
      const inserted = await db.one<{ id: number }>(
        'INSERT INTO authors (name, biography, created_at) VALUES ($1, $2, $3) RETURNING id',
        [input.name.trim(), input.biography?.trim() || null, new Date().toISOString()]
      )
      if (!inserted) throw new Error('Failed to create author')
      const item = await getListItem(toInt(inserted.id))
      if (!item) throw new Error('Failed to create author')
      return item
    },
    async update(id: number, input: AuthorInput): Promise<AuthorListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Author not found')
      await db.query('UPDATE authors SET name = $1, biography = $2 WHERE id = $3', [
        input.name.trim(),
        input.biography?.trim() || null,
        id
      ])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to update author')
      return item
    },
    async archive(id: number): Promise<AuthorListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Author not found')
      await db.query('UPDATE authors SET is_archived = TRUE WHERE id = $1', [id])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to archive author')
      return item
    }
  }
}