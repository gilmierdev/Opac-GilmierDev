import type { Db } from '../client'
import { nowIso, toIso, toBool, toInt, escapeLike } from './utils'
import type { Book, BookFilters, BookInput, DashboardStats, Paginated } from '@shared/types'

const BOOK_SELECT = `
  SELECT
    b.id,
    b.title,
    b.isbn,
    b.author_id,
    a.name AS author_name,
    b.category_id,
    c.name AS category_name,
    b.publisher_id,
    p.name AS publisher_name,
    b.publication_year,
    b.edition,
    b.subject,
    b.description,
    b.call_number,
    b.shelf_location,
    b.total_copies,
    b.available_copies,
    b.cover_image,
    b.is_archived,
    b.created_at,
    b.updated_at
  FROM books b
  LEFT JOIN authors a ON a.id = b.author_id
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN publishers p ON p.id = b.publisher_id
`

const SORT_CLAUSES: Record<string, string> = {
  title_asc: 'lower(b.title) ASC, b.id ASC',
  title_desc: 'lower(b.title) DESC, b.id DESC',
  author_asc: 'COALESCE(lower(a.name), \'\') ASC, lower(b.title) ASC, b.id ASC',
  author_desc: 'COALESCE(lower(a.name), \'\') DESC, lower(b.title) ASC, b.id DESC',
  year_desc: 'b.publication_year DESC NULLS LAST, b.id DESC',
  year_asc: 'b.publication_year ASC NULLS LAST, b.id ASC',
  recent: 'b.created_at DESC, b.id DESC'
}

interface BookRow {
  id: number | string
  title: string
  isbn: string | null
  author_id: number | null
  author_name: string | null
  category_id: number | null
  category_name: string | null
  publisher_id: number | null
  publisher_name: string | null
  publication_year: number | null
  edition: string | null
  subject: string | null
  description: string | null
  call_number: string | null
  shelf_location: string | null
  total_copies: number
  available_copies: number
  cover_image: string | null
  is_archived: boolean
  created_at: Date | string
  updated_at: Date | string
}

function mapBook(row: BookRow): Book {
  return {
    id: toInt(row.id),
    title: row.title,
    isbn: row.isbn,
    author_id: row.author_id == null ? null : toInt(row.author_id),
    author_name: row.author_name,
    category_id: row.category_id == null ? null : toInt(row.category_id),
    category_name: row.category_name,
    publisher_id: row.publisher_id == null ? null : toInt(row.publisher_id),
    publisher_name: row.publisher_name,
    publication_year: row.publication_year == null ? null : toInt(row.publication_year),
    edition: row.edition,
    subject: row.subject,
    description: row.description,
    call_number: row.call_number,
    shelf_location: row.shelf_location,
    total_copies: toInt(row.total_copies),
    available_copies: toInt(row.available_copies),
    cover_image: row.cover_image,
    is_archived: toBool(row.is_archived),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    available: toInt(row.available_copies) > 0
  }
}

function buildWhere(filters: BookFilters): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (!filters.includeArchived) {
    clauses.push('b.is_archived = FALSE')
  }

  const search = filters.search?.trim()
  if (search) {
    const terms = search.split(/\s+/).filter((t) => t.length > 0)
    const searchClauses: string[] = []
    for (const term of terms) {
      const like = `%${escapeLike(term)}%`
      searchClauses.push(`(
        b.title ILIKE $${params.length + 1} ESCAPE '\\'
        OR b.isbn ILIKE $${params.length + 2} ESCAPE '\\'
        OR b.subject ILIKE $${params.length + 3} ESCAPE '\\'
        OR b.description ILIKE $${params.length + 4} ESCAPE '\\'
        OR b.call_number ILIKE $${params.length + 5} ESCAPE '\\'
        OR a.name ILIKE $${params.length + 6} ESCAPE '\\'
        OR c.name ILIKE $${params.length + 7} ESCAPE '\\'
        OR p.name ILIKE $${params.length + 8} ESCAPE '\\'
        OR b.shelf_location ILIKE $${params.length + 9} ESCAPE '\\'
      )`)
      for (let i = 0; i < 9; i++) params.push(like)
    }
    clauses.push(`(${searchClauses.join(' AND ')})`)
  }

  if (filters.category_id != null) {
    params.push(filters.category_id)
    clauses.push(`b.category_id = $${params.length}`)
  }
  if (filters.author_id != null) {
    params.push(filters.author_id)
    clauses.push(`b.author_id = $${params.length}`)
  }
  if (filters.publisher_id != null) {
    params.push(filters.publisher_id)
    clauses.push(`b.publisher_id = $${params.length}`)
  }
  if (filters.year_from != null) {
    params.push(filters.year_from)
    clauses.push(`b.publication_year >= $${params.length}`)
  }
  if (filters.year_to != null) {
    params.push(filters.year_to)
    clauses.push(`b.publication_year <= $${params.length}`)
  }
  if (filters.availability === 'available') {
    clauses.push('b.available_copies > 0')
  } else if (filters.availability === 'unavailable') {
    clauses.push('b.available_copies <= 0')
  }

  return { where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

export interface BooksRepository {
  list(filters: BookFilters): Promise<Paginated<Book>>
  getById(id: number): Promise<Book | null>
  getBookRows(filters: BookFilters): Promise<Book[]>
  create(input: BookInput): Promise<Book>
  update(id: number, input: BookInput): Promise<Book>
  archive(id: number): Promise<Book>
  restore(id: number): Promise<Book>
  dashboardStats(): Promise<DashboardStats>
  countAll(): Promise<number>
}

export function booksRepository(db: Db): BooksRepository {
  async function findRow(id: number): Promise<Book | null> {
    const row = await db.one<BookRow>(`${BOOK_SELECT} WHERE b.id = $1`, [id])
    return row ? mapBook(row) : null
  }

  async function validate(input: BookInput & { id?: number }): Promise<void> {
    const total = input.total_copies ?? 1
    const available = input.available_copies ?? total
    if (total < 1) throw new Error('Total copies must be at least 1')
    if (available < 0) throw new Error('Available copies cannot be negative')
    if (available > total) throw new Error('Available copies cannot exceed total copies')
    if (input.isbn?.trim()) {
      const dup = await db.one<{ id: number }>(
        'SELECT id FROM books WHERE isbn = $1 AND id <> $2',
        [input.isbn.trim(), input.id ?? -1]
      )
      if (dup) throw new Error('A book with this ISBN already exists')
    }
    if (input.publication_year != null) {
      const year = input.publication_year
      if (year < 0 || year > 9999) throw new Error('Invalid publication year')
    }
  }

  return {
    async list(filters): Promise<Paginated<Book>> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 12))
      const { where, params } = buildWhere(filters)
      const sort = SORT_CLAUSES[filters.sort ?? 'title_asc'] ?? SORT_CLAUSES.title_asc

      const countSql = `
        SELECT COUNT(*)::int AS total FROM books b
        LEFT JOIN authors a ON a.id = b.author_id
        LEFT JOIN categories c ON c.id = b.category_id
        LEFT JOIN publishers p ON p.id = b.publisher_id
        ${where}`
      const { total } = (await db.one<{ total: number }>(countSql, params)) ?? { total: 0 }

      const listSql = `${BOOK_SELECT}${where} ORDER BY ${sort} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      const rows = await db.many<BookRow>(listSql, params)

      return {
        items: rows.map(mapBook),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize)
      }
    },
    async getById(id): Promise<Book | null> {
      return findRow(id)
    },
    async getBookRows(filters): Promise<Book[]> {
      const { where, params } = buildWhere(filters)
      const rows = await db.many<BookRow>(`${BOOK_SELECT}${where}`, params)
      return rows.map(mapBook)
    },
    async create(input): Promise<Book> {
      await validate(input)
      const ts = nowIso()
      const total = input.total_copies ?? 1
      const available = input.available_copies ?? total
      const inserted = await db.one<{ id: number }>(
        `INSERT INTO books (
          title, isbn, author_id, category_id, publisher_id, publication_year,
          edition, subject, description, call_number, shelf_location,
          total_copies, available_copies, cover_image, is_archived, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE, $15, $16)
        RETURNING id`,
        [
          input.title.trim(),
          input.isbn?.trim() || null,
          input.author_id ?? null,
          input.category_id ?? null,
          input.publisher_id ?? null,
          input.publication_year ?? null,
          input.edition?.trim() || null,
          input.subject?.trim() || null,
          input.description?.trim() || null,
          input.call_number?.trim() || null,
          input.shelf_location?.trim() || null,
          total,
          available,
          input.cover_image ?? null,
          ts,
          ts
        ]
      )
      if (!inserted) throw new Error('Failed to create book')
      const row = await findRow(toInt(inserted.id))
      if (!row) throw new Error('Failed to create book')
      return row
    },
    async update(id, input): Promise<Book> {
      const existing = await findRow(id)
      if (!existing) throw new Error('Book not found')
      await validate({ ...input, id })

      const sets: string[] = ['updated_at = $2']
      const params: unknown[] = [id, nowIso()]
      let paramIndex = 3
      const push = (clause: string, value: unknown): void => {
        sets.push(`${clause} = $${paramIndex}`)
        params.push(value)
        paramIndex += 1
      }

      if (input.title !== undefined) push('title', input.title.trim())
      if (input.isbn !== undefined) push('isbn', input.isbn?.trim() || null)
      if (input.author_id !== undefined) push('author_id', input.author_id ?? null)
      if (input.category_id !== undefined) push('category_id', input.category_id ?? null)
      if (input.publisher_id !== undefined) push('publisher_id', input.publisher_id ?? null)
      if (input.publication_year !== undefined) push('publication_year', input.publication_year ?? null)
      if (input.edition !== undefined) push('edition', input.edition?.trim() || null)
      if (input.subject !== undefined) push('subject', input.subject?.trim() || null)
      if (input.description !== undefined) push('description', input.description?.trim() || null)
      if (input.call_number !== undefined) push('call_number', input.call_number?.trim() || null)
      if (input.shelf_location !== undefined) push('shelf_location', input.shelf_location?.trim() || null)
      if (input.cover_image !== undefined) push('cover_image', input.cover_image ?? null)
      if (input.total_copies !== undefined || input.available_copies !== undefined) {
        const total = input.total_copies ?? existing.total_copies
        let available = input.available_copies !== undefined ? input.available_copies : existing.available_copies
        if (available > total) available = total
        push('total_copies', total)
        push('available_copies', available)
      }

      await db.query(`UPDATE books SET ${sets.join(', ')} WHERE id = $1`, params)
      const row = await findRow(id)
      if (!row) throw new Error('Failed to update book')
      return row
    },
    async archive(id): Promise<Book> {
      const existing = await findRow(id)
      if (!existing) throw new Error('Book not found')
      await db.query('UPDATE books SET is_archived = TRUE, updated_at = $2 WHERE id = $1', [id, nowIso()])
      const row = await findRow(id)
      if (!row) throw new Error('Failed to archive book')
      return row
    },
    async restore(id): Promise<Book> {
      const existing = await findRow(id)
      if (!existing) throw new Error('Book not found')
      await db.query('UPDATE books SET is_archived = FALSE, updated_at = $2 WHERE id = $1', [id, nowIso()])
      const row = await findRow(id)
      if (!row) throw new Error('Failed to restore book')
      return row
    },
    async dashboardStats(): Promise<DashboardStats> {
      const totals = (await db.one<{ total_books: number; total_copies: number; available_copies: number }>(
        `SELECT
           COUNT(*)::int AS total_books,
           COALESCE(SUM(total_copies), 0)::int AS total_copies,
           COALESCE(SUM(available_copies), 0)::int AS available_copies
         FROM books WHERE is_archived = FALSE`
      )) ?? { total_books: 0, total_copies: 0, available_copies: 0 }

      const active = (await db.one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM borrowings WHERE status = 'borrowed'`
      )) ?? { c: 0 }

      const overdue = (await db.one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM borrowings
         WHERE status = 'borrowed' AND due_date IS NOT NULL AND due_date < CURRENT_DATE`
      )) ?? { c: 0 }

      const recentBooks = (await this.list({ sort: 'recent', page: 1, pageSize: 6 })).items

      const authorCount = (await db.one<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM authors WHERE is_archived = FALSE'
      )) ?? { c: 0 }
      const categoryCount = (await db.one<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM categories WHERE is_archived = FALSE'
      )) ?? { c: 0 }
      const publisherCount = (await db.one<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM publishers WHERE is_archived = FALSE'
      )) ?? { c: 0 }

      return {
        totalBooks: totals.total_books,
        totalCopies: totals.total_copies,
        availableCopies: totals.available_copies,
        borrowedCopies: totals.total_copies - totals.available_copies,
        authors: authorCount.c,
        categories: categoryCount.c,
        publishers: publisherCount.c,
        activeBorrowings: active.c,
        overdueBooks: overdue.c,
        recentBooks
      }
    },
    async countAll(): Promise<number> {
      const row = await db.one<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM books WHERE is_archived = FALSE'
      )
      return row?.c ?? 0
    }
  }
}