import { IPC } from '@shared/api'
import type { BorrowingInput, BorrowingFilters } from '@shared/types'
import { registerIpc } from './register'
import { borrowingsRepository } from '../database/repositories/borrowings.repository'
import type { Services } from './types'

export function registerBorrowingsIpc({ getDb, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(
    IPC.borrowingsList,
    (filters: BorrowingFilters = {}) => {
      return borrowingsRepository(getDb()).list(sanitizeFilters(filters))
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.borrowingsCreate,
    (input: BorrowingInput) => {
      if (!input || typeof input !== 'object') throw new Error('Invalid request')
      if (!Number.isInteger(input.book_id) || input.book_id <= 0) throw new Error('Book is required')
      if (typeof input.borrower_name !== 'string' || !input.borrower_name.trim()) {
        throw new Error('Borrower name is required')
      }
      if (input.due_date != null && typeof input.due_date !== 'string') throw new Error('Invalid due date')
      return borrowingsRepository(getDb()).create(input)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.borrowingsReturn,
    (id: number) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid borrowing id')
      return borrowingsRepository(getDb()).recordReturn(id)
    },
    { context: ctx, requireAuth: true }
  )
}

function sanitizeFilters(filters: BorrowingFilters): BorrowingFilters {
  const out: BorrowingFilters = { ...filters }
  return out
}