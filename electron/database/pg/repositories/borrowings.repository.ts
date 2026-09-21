import type { Db } from '../client'
import { nowIso, toIso, toInt, escapeLike } from './utils'
import type { Borrowing, BorrowingFilters, BorrowingInput, Paginated } from '@shared/types'

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

interface BorrowingRow {
  id: number | string
  book_id: number | string
  book_title: string | null
  book_cover: string | null
  book_call_number: string | null
  borrower_name: string
  borrower_id: string | null
  borrowed_at: Date | string
  due_date: string | null
  returned_at: Date | string | null
  status: string
}

function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    const yyyy = value.getFullYear()
    const mm = String(value.getMonth() + 1).padStart(2, '0')
    const dd = String(value.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return String(value).slice(0, 10)
}

function rowToBorrowing(row: BorrowingRow): Borrowing {
  const borrowedAt = toIso(row.borrowed_at)
  const dueDate = toDateString(row.due_date)
  const returnedAt = row.returned_at ? toIso(row.returned_at) : null
  let status = row.status ?? 'borrowed'
  if (status === 'borrowed' && dueDate && dueDate < todayDate()) {
    status = 'overdue'
  }
  return {
    id: toInt(row.id),
    book_id: toInt(row.book_id),
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
  list(filters: BorrowingFilters): Promise<Paginated<Borrowing>>
  getById(id: number): Promise<Borrowing | null>
  create(input: BorrowingInput): Promise<Borrowing>
  recordReturn(id: number): Promise<Borrowing>
  activeCount(bookId: number): Promise<number>
  listByBook(bookId: number): Promise<Borrowing[]>
}

export function borrowingsRepository(db: Db): BorrowingsRepository {
  async function getRow(id: number): Promise<BorrowingRow | null> {
    const row = await db.one<BorrowingRow>(`${SELECT} WHERE br.id = $1`, [id])
    return row ?? null
  }

  return {
    async list(filters): Promise<Paginated<Borrowing>> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 15))
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters.status === 'returned') {
        clauses.push(`br.status = 'returned'`)
      } else if (filters.status === 'borrowed') {
        clauses.push(`br.status = 'borrowed' AND (br.due_date IS NULL OR br.due_date >= CURRENT_DATE)`)
      } else if (filters.status === 'overdue') {
        clauses.push(`br.status = 'borrowed' AND br.due_date IS NOT NULL AND br.due_date < CURRENT_DATE`)
      }

      if (filters.search?.trim()) {
        const like = `%${escapeLike(filters.search.trim())}%`
        clauses.push(
          `(br.borrower_name ILIKE $${params.length + 1} ESCAPE '\\' OR br.borrower_id ILIKE $${params.length + 2} ESCAPE '\\' OR b.title ILIKE $${params.length + 3} ESCAPE '\\')`
        )
        params.push(like, like, like)
      }

      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''

      const count = (await db.one<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM borrowings br LEFT JOIN books b ON b.id = br.book_id${where}`,
        params
      )) ?? { total: 0 }

      const rows = await db.many<BorrowingRow>(
        `${SELECT}${where} ORDER BY br.borrowed_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params
      )

      return {
        items: rows.map(rowToBorrowing),
        total: count.total,
        page,
        pageSize,
        totalPages: count.total === 0 ? 1 : Math.ceil(count.total / pageSize)
      }
    },
    async getById(id): Promise<Borrowing | null> {
      const row = await getRow(id)
      return row ? rowToBorrowing(row) : null
    },
    async create(input): Promise<Borrowing> {
      const borrowedAt = input.borrowed_at || nowIso()
      const dueDate = input.due_date ?? null

      // Row-lock the book inside a transaction so two operators cannot borrow
      // the same final available copy concurrently.
      const newId = await db.tx(async (tx) => {
        const book = await tx.one<{ total_copies: number; available_copies: number }>(
          'SELECT total_copies, available_copies FROM books WHERE id = $1 FOR UPDATE',
          [input.book_id]
        )
        if (!book) throw new Error('Book not found')
        if (book.available_copies <= 0) {
          throw new Error('No available copies of this book')
        }
        const res = await tx.query<{ id: number }>(
          `INSERT INTO borrowings (book_id, borrower_name, borrower_id, borrowed_at, due_date, status)
           VALUES ($1, $2, $3, $4, $5, 'borrowed')
           RETURNING id`,
          [input.book_id, input.borrower_name.trim(), input.borrower_id?.trim() || null, borrowedAt, dueDate]
        )
        const updated = await tx.one<{ id: number }>(
          `UPDATE books SET available_copies = available_copies - 1, updated_at = $2
           WHERE id = $1 AND available_copies > 0
           RETURNING id`,
          [input.book_id, nowIso()]
        )
        if (!updated) throw new Error('No available copies of this book')
        return toInt(res.rows[0].id)
      })

      const row = await getRow(newId)
      if (!row) throw new Error('Failed to create borrowing')
      return rowToBorrowing(row)
    },
    async recordReturn(id): Promise<Borrowing> {
      const existing = await getRow(id)
      if (!existing) throw new Error('Borrowing record not found')
      const current = rowToBorrowing(existing)
      if (current.status === 'returned') throw new Error('This borrowing was already returned')

      await db.tx(async (tx) => {
        await tx.query(
          `UPDATE borrowings SET status = 'returned', returned_at = $2 WHERE id = $1 AND status <> 'returned'`,
          [id, nowIso()]
        )
        await tx.query(
          `UPDATE books SET available_copies = LEAST(available_copies + 1, total_copies), updated_at = $2
           WHERE id = $1`,
          [current.book_id, nowIso()]
        )
      })

      const row = await getRow(id)
      if (!row) throw new Error('Failed to update borrowing')
      return rowToBorrowing(row)
    },
    async activeCount(bookId): Promise<number> {
      const row = await db.one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM borrowings WHERE book_id = $1 AND status = 'borrowed'`,
        [bookId]
      )
      return row?.c ?? 0
    },
    async listByBook(bookId): Promise<Borrowing[]> {
      const rows = await db.many<BorrowingRow>(
        `${SELECT} WHERE br.book_id = $1 ORDER BY br.borrowed_at DESC`,
        [bookId]
      )
      return rows.map(rowToBorrowing)
    }
  }
}