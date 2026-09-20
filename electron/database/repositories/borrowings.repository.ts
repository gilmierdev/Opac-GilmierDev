import type { DB } from '../connection'
import { now, todayDate } from './utils'
import type {
  Borrowing,
  BorrowingFilters,
  BorrowingInput,
  Paginated
} from '@shared/types'

const SELECT = `
  SELECT
    br.id,
    br.book_id,
    b.title AS book_title,
    b.cover_image AS book_cover,
    b.call_number AS book_call_number,
    br.borrower_name,
    br.borrower_id,
    br.borrowed_at,
    br.due_date,
    br.returned_at,
    br.status
  FROM borrowings br
  LEFT JOIN books b ON b.id = br.book_id
`

function rowToBorrowing(row: any): Borrowing {
  const borrowedAt = row.borrowed_at as string
  const dueDate = row.due_date as string | null
  const returnedAt = row.returned_at as string | null
  let status = (row.status ?? 'borrowed') as string
  if (status === 'borrowed' && dueDate && dueDate < todayDate()) {
    status = 'overdue'
  }
  return {
    id: row.id,
    book_id: row.book_id,
    book_title: row.book_title,
    book_cover: row.book_cover,
    book_call_number: row.book_call_number,
    borrower_name: row.borrower_name,
    borrower_id: row.borrower_id,
    borrowed_at: borrowedAt,
    due_date: dueDate,
    returned_at: returnedAt,
    status: status as Borrowing['status']
  }
}

export interface BorrowingsRepository {
  list(filters: BorrowingFilters): Paginated<Borrowing>
  getById(id: number): Borrowing | null
  create(input: BorrowingInput): Borrowing
  recordReturn(id: number): Borrowing
  activeCount(bookId: number): number
  listByBook(bookId: number): Borrowing[]
}

export function borrowingsRepository(db: DB): BorrowingsRepository {
  const insertStmt = db.prepare(`
    INSERT INTO borrowings (book_id, borrower_name, borrower_id, borrowed_at, due_date, status)
    VALUES (@book_id, @borrower_name, @borrower_id, @borrowed_at, @due_date, 'borrowed')
  `)
  const getByIdStmt = db.prepare(`${SELECT} WHERE br.id = ?`)
  const updateStatusStmt = db.prepare(`
    UPDATE borrowings SET status = ?, returned_at = ? WHERE id = ?
  `)
  const bookStmt = db.prepare(`
    SELECT total_copies, available_copies FROM books WHERE id = ?
  `)
  const incrementAvailableStmt = db.prepare(`
    UPDATE books
    SET available_copies = MIN(available_copies + 1, total_copies), updated_at = ?
    WHERE id = ?
  `)
  const decrementAvailableStmt = db.prepare(`
    UPDATE books
    SET available_copies = available_copies - 1, updated_at = ?
    WHERE id = ? AND available_copies > 0
  `)
  const activeCountStmt = db.prepare(`
    SELECT COUNT(*) as c FROM borrowings
    WHERE book_id = ? AND status = 'borrowed'
  `)
  const byBookStmt = db.prepare(`${SELECT} WHERE br.book_id = ? ORDER BY br.borrowed_at DESC`)

  return {
    list(filters): Paginated<Borrowing> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 15))
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters.status === 'returned') {
        clauses.push(`br.status = 'returned'`)
      } else if (filters.status === 'borrowed') {
        clauses.push(`br.status = 'borrowed' AND (br.due_date IS NULL OR date(br.due_date) >= date('now'))`)
      } else if (filters.status === 'overdue') {
        clauses.push(`br.status = 'borrowed' AND br.due_date IS NOT NULL AND date(br.due_date) < date('now')`)
      }

      if (filters.search?.trim()) {
        const like = `%${filters.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
        clauses.push(`(br.borrower_name LIKE ? ESCAPE '\\' OR br.borrower_id LIKE ? ESCAPE '\\' OR b.title LIKE ? ESCAPE '\\')`)
        params.push(like, like, like)
      }

      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''

      const countStmt = db.prepare(
        `SELECT COUNT(*) as total FROM borrowings br LEFT JOIN books b ON b.id = br.book_id${where}`
      )
      const { total } = countStmt.get(...params) as { total: number }

      const listStmt = db.prepare(
        `${SELECT}${where} ORDER BY br.borrowed_at DESC LIMIT ? OFFSET ?`
      )
      const rows = listStmt.all(...params, pageSize, (page - 1) * pageSize) as any[]

      return {
        items: rows.map((r) => rowToBorrowing(r)),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize)
      }
    },
    getById(id) {
      const row = getByIdStmt.get(id)
      return row ? rowToBorrowing(row as any) : null
    },
    create(input) {
      const book = bookStmt.get(input.book_id) as { total_copies: number; available_copies: number } | undefined
      if (!book) throw new Error('Book not found')
      if (book.available_copies <= 0) {
        throw new Error('No available copies of this book')
      }

      const borrowedAt = input.borrowed_at || now()
      const dueDate = input.due_date ?? null

      const tx = db.transaction(() => {
        const result = insertStmt.run({
          book_id: input.book_id,
          borrower_name: input.borrower_name.trim(),
          borrower_id: input.borrower_id?.trim() || null,
          borrowed_at: borrowedAt,
          due_date: dueDate
        })
        const affected = decrementAvailableStmt.run(now(), input.book_id)
        if (affected.changes === 0) {
          throw new Error('No available copies of this book')
        }
        return result.lastInsertRowid
      })

      const newId = tx()
      const row = getByIdStmt.get(newId)
      return rowToBorrowing(row as any)
    },
    recordReturn(id) {
      const existing = this.getById(id)
      if (!existing) throw new Error('Borrowing record not found')
      if (existing.status === 'returned') throw new Error('This borrowing was already returned')

      const tx = db.transaction(() => {
        updateStatusStmt.run('returned', now(), id)
        incrementAvailableStmt.run(now(), existing.book_id)
      })
      tx()

      const row = getByIdStmt.get(id)
      return rowToBorrowing(row as any)
    },
    activeCount(bookId) {
      const row = activeCountStmt.get(bookId) as { c: number }
      return row.c
    },
    listByBook(bookId) {
      const rows = byBookStmt.all(bookId) as any[]
      return rows.map((r) => rowToBorrowing(r))
    }
  }
}