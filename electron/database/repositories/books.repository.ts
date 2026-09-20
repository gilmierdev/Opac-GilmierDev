import type { DB } from '../connection'
import { now, toBool } from './utils'
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
    CAST(b.is_archived AS INTEGER) AS is_archived,
    b.created_at,
    b.updated_at
  FROM books b
  LEFT JOIN authors a ON a.id = b.author_id
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN publishers p ON p.id = b.publisher_id
`

const SORT_COLUMNS: Record<string, string> = {
  title_asc: 'b.title COLLATE NOCASE ASC, b.id ASC',
  title_desc: 'b.title COLLATE NOCASE DESC, b.id DESC',
  author_asc: 'COALESCE(a.name, \'\') COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC',
  author_desc: 'COALESCE(a.name, \'\') COLLATE NOCASE DESC, b.title COLLATE NOCASE DESC',
  year_desc: 'b.publication_year DESC, b.id DESC',
  year_asc: 'b.publication_year ASC, b.id ASC',
  recent: 'b.created_at DESC, b.id DESC'
}

interface BookRow {
  id: number
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
  is_archived: number
  created_at: string
  updated_at: string
}

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    isbn: row.isbn,
    author_id: row.author_id,
    author_name: row.author_name,
    category_id: row.category_id,
    category_name: row.category_name,
    publisher_id: row.publisher_id,
    publisher_name: row.publisher_name,
    publication_year: row.publication_year,
    edition: row.edition,
    subject: row.subject,
    description: row.description,
    call_number: row.call_number,
    shelf_location: row.shelf_location,
    total_copies: row.total_copies,
    available_copies: row.available_copies,
    cover_image: row.cover_image,
    is_archived: toBool(row.is_archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
    available: row.available_copies > 0
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

function buildWhere(filters: BookFilters): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (!filters.includeArchived) {
    clauses.push('b.is_archived = 0')
  }

  const search = filters.search?.trim()
  if (search) {
    const terms = search.split(/\s+/).filter((t) => t.length > 0)
    const searchClauses: string[] = []
    for (const term of terms) {
      const like = `%${escapeLike(term)}%`
      searchClauses.push(`(
        b.title LIKE ? ESCAPE '\\'
        OR b.isbn LIKE ? ESCAPE '\\'
        OR b.subject LIKE ? ESCAPE '\\'
        OR b.description LIKE ? ESCAPE '\\'
        OR b.call_number LIKE ? ESCAPE '\\'
        OR a.name LIKE ? ESCAPE '\\'
        OR c.name LIKE ? ESCAPE '\\'
        OR p.name LIKE ? ESCAPE '\\'
        OR b.shelf_location LIKE ? ESCAPE '\\'
      )`)
      for (let i = 0; i < 9; i++) params.push(like)
    }
    clauses.push(`(${searchClauses.join(' AND ')})`)
  }

  if (filters.category_id != null) {
    clauses.push('b.category_id = ?')
    params.push(filters.category_id)
  }
  if (filters.author_id != null) {
    clauses.push('b.author_id = ?')
    params.push(filters.author_id)
  }
  if (filters.publisher_id != null) {
    clauses.push('b.publisher_id = ?')
    params.push(filters.publisher_id)
  }
  if (filters.year_from != null) {
    clauses.push('b.publication_year >= ?')
    params.push(filters.year_from)
  }
  if (filters.year_to != null) {
    clauses.push('b.publication_year <= ?')
    params.push(filters.year_to)
  }
  if (filters.availability === 'available') {
    clauses.push('b.available_copies > 0')
  } else if (filters.availability === 'unavailable') {
    clauses.push('b.available_copies <= 0')
  }

  return { where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

export interface BooksRepository {
  list(filters: BookFilters): Paginated<Book>
  getById(id: number): Book | null
  getBookRows(filters: BookFilters): Book[]
  create(input: BookInput): Book
  update(id: number, input: BookInput): Book
  archive(id: number): Book
  restore(id: number): Book
  dashboardStats(): DashboardStats
  countAll(): number
}

export function booksRepository(db: DB): BooksRepository {
  const insertStmt = db.prepare(`
    INSERT INTO books (
      title, isbn, author_id, category_id, publisher_id, publication_year,
      edition, subject, description, call_number, shelf_location,
      total_copies, available_copies, cover_image, is_archived, created_at, updated_at
    ) VALUES (
      @title, @isbn, @author_id, @category_id, @publisher_id, @publication_year,
      @edition, @subject, @description, @call_number, @shelf_location,
      @total_copies, @available_copies, @cover_image, @is_archived, @created_at, @updated_at
    )
  `)

  const getByIdStmt = db.prepare(`${BOOK_SELECT} WHERE b.id = ?`)
  const findExisting = (id: number): BookRow | undefined =>
    getByIdStmt.get(id) as BookRow | undefined

  function validate(input: BookInput & { id?: number }): void {
    const total = input.total_copies ?? 1
    const available = input.available_copies ?? total
    if (total < 1) throw new Error('Total copies must be at least 1')
    if (available < 0) throw new Error('Available copies cannot be negative')
    if (available > total) throw new Error('Available copies cannot exceed total copies')
    if (input.isbn?.trim()) {
      const dup = db
        .prepare('SELECT id FROM books WHERE isbn = ? AND id <> ?')
        .get(input.isbn.trim(), input.id ?? -1)
      if (dup) throw new Error('A book with this ISBN already exists')
    }
    if (input.publication_year != null) {
      const year = input.publication_year
      if (year < 0 || year > 9999) throw new Error('Invalid publication year')
    }
  }

  return {
    list(filters): Paginated<Book> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 12))
      const { where, params } = buildWhere(filters)
      const sort = SORT_COLUMNS[filters.sort ?? 'title_asc'] ?? SORT_COLUMNS.title_asc

      const countStmt = db.prepare(
        `SELECT COUNT(*) as total FROM books b
         LEFT JOIN authors a ON a.id = b.author_id
         LEFT JOIN categories c ON c.id = b.category_id
         LEFT JOIN publishers p ON p.id = b.publisher_id
         ${where}`
      )
      const { total } = countStmt.get(...params) as { total: number }

      const listStmt = db.prepare(`${BOOK_SELECT}${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      const rows = listStmt.all(...params, pageSize, (page - 1) * pageSize) as BookRow[]

      return {
        items: rows.map(mapBook),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize)
      }
    },
    getById(id) {
      const row = findExisting(id)
      return row ? mapBook(row) : null
    },
    getBookRows(filters) {
      const { where, params } = buildWhere(filters)
      const rows = db.prepare(`${BOOK_SELECT}${where}`).all(...params) as BookRow[]
      return rows.map(mapBook)
    },
    create(input) {
      validate(input)
      const ts = now()
      const total = input.total_copies ?? 1
      const available = input.available_copies ?? total
      const result = insertStmt.run({
        title: input.title.trim(),
        isbn: input.isbn?.trim() || null,
        author_id: input.author_id ?? null,
        category_id: input.category_id ?? null,
        publisher_id: input.publisher_id ?? null,
        publication_year: input.publication_year ?? null,
        edition: input.edition?.trim() || null,
        subject: input.subject?.trim() || null,
        description: input.description?.trim() || null,
        call_number: input.call_number?.trim() || null,
        shelf_location: input.shelf_location?.trim() || null,
        total_copies: total,
        available_copies: available,
        cover_image: input.cover_image ?? null,
        is_archived: 0,
        created_at: ts,
        updated_at: ts
      })
      const row = findExisting(Number(result.lastInsertRowid))
      if (!row) throw new Error('Failed to create book')
      return mapBook(row)
    },
    update(id, input) {
      const existing = findExisting(id)
      if (!existing) throw new Error('Book not found')
      validate({ ...input, id })

      const sets: string[] = ['updated_at = @updated_at']
      const params: Record<string, unknown> = { id, updated_at: now() }

      if (input.title !== undefined) {
        sets.push('title = @title')
        params.title = input.title.trim()
      }
      if (input.isbn !== undefined) {
        sets.push('isbn = @isbn')
        params.isbn = input.isbn?.trim() || null
      }
      if (input.author_id !== undefined) {
        sets.push('author_id = @author_id')
        params.author_id = input.author_id ?? null
      }
      if (input.category_id !== undefined) {
        sets.push('category_id = @category_id')
        params.category_id = input.category_id ?? null
      }
      if (input.publisher_id !== undefined) {
        sets.push('publisher_id = @publisher_id')
        params.publisher_id = input.publisher_id ?? null
      }
      if (input.publication_year !== undefined) {
        sets.push('publication_year = @publication_year')
        params.publication_year = input.publication_year ?? null
      }
      if (input.edition !== undefined) {
        sets.push('edition = @edition')
        params.edition = input.edition?.trim() || null
      }
      if (input.subject !== undefined) {
        sets.push('subject = @subject')
        params.subject = input.subject?.trim() || null
      }
      if (input.description !== undefined) {
        sets.push('description = @description')
        params.description = input.description?.trim() || null
      }
      if (input.call_number !== undefined) {
        sets.push('call_number = @call_number')
        params.call_number = input.call_number?.trim() || null
      }
      if (input.shelf_location !== undefined) {
        sets.push('shelf_location = @shelf_location')
        params.shelf_location = input.shelf_location?.trim() || null
      }
      if (input.cover_image !== undefined) {
        sets.push('cover_image = @cover_image')
        params.cover_image = input.cover_image ?? null
      }
      if (input.total_copies !== undefined || input.available_copies !== undefined) {
        const total = input.total_copies ?? existing.total_copies
        let available =
          input.available_copies !== undefined ? input.available_copies : existing.available_copies
        if (available > total) available = total
        sets.push('total_copies = @total_copies', 'available_copies = @available_copies')
        params.total_copies = total
        params.available_copies = available
      }

      db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = @id`).run(params)
      const row = findExisting(id)
      if (!row) throw new Error('Failed to update book')
      return mapBook(row)
    },
    archive(id) {
      const existing = findExisting(id)
      if (!existing) throw new Error('Book not found')
      db.prepare('UPDATE books SET is_archived = 1, updated_at = ? WHERE id = ?').run(now(), id)
      const row = findExisting(id)
      return mapBook(row as BookRow)
    },
    restore(id) {
      const existing = findExisting(id)
      if (!existing) throw new Error('Book not found')
      db.prepare('UPDATE books SET is_archived = 0, updated_at = ? WHERE id = ?').run(now(), id)
      const row = findExisting(id)
      return mapBook(row as BookRow)
    },
    dashboardStats(): DashboardStats {
      const totals = db
        .prepare(
          `SELECT
             COUNT(*) as total_books,
             COALESCE(SUM(total_copies), 0) as total_copies,
             COALESCE(SUM(available_copies), 0) as available_copies
           FROM books WHERE is_archived = 0`
        )
        .get() as { total_books: number; total_copies: number; available_copies: number }

      const activeBorrowings = db
        .prepare(`SELECT COUNT(*) as c FROM borrowings WHERE status = 'borrowed'`)
        .get() as { c: number }

      const overdueBooks = db
        .prepare(
          `SELECT COUNT(*) as c FROM borrowings
           WHERE status = 'borrowed' AND due_date IS NOT NULL AND date(due_date) < date('now')`
        )
        .get() as { c: number }

      const recentBooks = this.list({ sort: 'recent', page: 1, pageSize: 6 }).items

      const authorCount = (
        db.prepare('SELECT COUNT(*) as c FROM authors WHERE is_archived = 0').get() as { c: number }
      ).c
      const categoryCount = (
        db.prepare('SELECT COUNT(*) as c FROM categories WHERE is_archived = 0').get() as {
          c: number
        }
      ).c
      const publisherCount = (
        db.prepare('SELECT COUNT(*) as c FROM publishers WHERE is_archived = 0').get() as {
          c: number
        }
      ).c

      return {
        totalBooks: totals.total_books,
        totalCopies: totals.total_copies,
        availableCopies: totals.available_copies,
        borrowedCopies: totals.total_copies - totals.available_copies,
        authors: authorCount,
        categories: categoryCount,
        publishers: publisherCount,
        activeBorrowings: activeBorrowings.c,
        overdueBooks: overdueBooks.c,
        recentBooks
      }
    },
    countAll() {
      const row = db.prepare('SELECT COUNT(*) as c FROM books WHERE is_archived = 0').get() as {
        c: number
      }
      return row.c
    }
  }
}