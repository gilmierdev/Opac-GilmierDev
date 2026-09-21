import type { Db } from '../client'
import { toIso, toBool, toInt } from './utils'
import type { Publisher, PublisherInput, PublisherListItem } from '@shared/types'

const LIST_SELECT = `
  SELECT
    p.id,
    p.name,
    p.address,
    p.website,
    p.is_archived,
    p.created_at,
    (SELECT COUNT(*) FROM books b WHERE b.publisher_id = p.id)::int AS book_count
  FROM publishers p
`

interface PublisherRow {
  id: number | string
  name: string
  address: string | null
  website: string | null
  is_archived: boolean
  created_at: Date | string
  book_count: number | string
}

export interface PublishersRepository {
  list(includeArchived?: boolean): Promise<PublisherListItem[]>
  getById(id: number): Promise<Publisher | null>
  create(input: PublisherInput): Promise<PublisherListItem>
  update(id: number, input: PublisherInput): Promise<PublisherListItem>
  archive(id: number): Promise<PublisherListItem>
}

function map(row: PublisherRow): PublisherListItem {
  return {
    id: toInt(row.id),
    name: row.name,
    address: row.address,
    website: row.website,
    is_archived: toBool(row.is_archived),
    book_count: toInt(row.book_count),
    created_at: toIso(row.created_at)
  }
}

export function publishersRepository(db: Db): PublishersRepository {
  const getListItem = async (id: number): Promise<PublisherListItem | null> => {
    const row = await db.one<PublisherRow>(`${LIST_SELECT} WHERE p.id = $1`, [id])
    return row ? map(row) : null
  }

  return {
    async list(includeArchived = false): Promise<PublisherListItem[]> {
      const sql = includeArchived
        ? `${LIST_SELECT} ORDER BY lower(p.name) ASC, p.id ASC`
        : `${LIST_SELECT} WHERE p.is_archived = FALSE ORDER BY lower(p.name) ASC, p.id ASC`
      const rows = await db.many<PublisherRow>(sql)
      return rows.map(map)
    },
    async getById(id: number): Promise<Publisher | null> {
      const row = await db.one<PublisherRow>(
        'SELECT id, name, address, website, is_archived, created_at FROM publishers WHERE id = $1',
        [id]
      )
      if (!row) return null
      return {
        id: toInt(row.id),
        name: row.name,
        address: row.address,
        website: row.website,
        is_archived: toBool(row.is_archived),
        created_at: toIso(row.created_at)
      }
    },
    async create(input: PublisherInput): Promise<PublisherListItem> {
      const inserted = await db.one<{ id: number }>(
        'INSERT INTO publishers (name, address, website, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [input.name.trim(), input.address?.trim() || null, input.website?.trim() || null, new Date().toISOString()]
      )
      if (!inserted) throw new Error('Failed to create publisher')
      const item = await getListItem(toInt(inserted.id))
      if (!item) throw new Error('Failed to create publisher')
      return item
    },
    async update(id: number, input: PublisherInput): Promise<PublisherListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Publisher not found')
      await db.query('UPDATE publishers SET name = $1, address = $2, website = $3 WHERE id = $4', [
        input.name.trim(),
        input.address?.trim() || null,
        input.website?.trim() || null,
        id
      ])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to update publisher')
      return item
    },
    async archive(id: number): Promise<PublisherListItem> {
      const existing = await this.getById(id)
      if (!existing) throw new Error('Publisher not found')
      await db.query('UPDATE publishers SET is_archived = TRUE WHERE id = $1', [id])
      const item = await getListItem(id)
      if (!item) throw new Error('Failed to archive publisher')
      return item
    }
  }
}