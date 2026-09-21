import { IPC } from '@shared/api'
import type { BorrowingInput, BorrowingFilters } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerBorrowingsIpc({ borrowings, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(borrowings, 'Borrowing records')

  registerIpc(IPC.borrowingsList, (filters: BorrowingFilters = {}) => svc.list(sanitizeFilters(filters)), {
    context: ctx,
    requireAuth: true
  })
  registerIpc(IPC.borrowingsCreate, (input: BorrowingInput) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid request')
    if (!Number.isInteger(input.book_id) || input.book_id <= 0) throw new Error('Book is required')
    if (typeof input.borrower_name !== 'string' || !input.borrower_name.trim()) {
      throw new Error('Borrower name is required')
    }
    if (input.due_date != null && typeof input.due_date !== 'string') throw new Error('Invalid due date')
    return svc.create(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.borrowingsReturn, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid borrowing id')
    return svc.return(id)
  }, { context: ctx, requireAuth: true })
}

function sanitizeFilters(filters: BorrowingFilters): BorrowingFilters {
  return { ...filters }
}