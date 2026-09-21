import { IPC } from '@shared/api'
import type { BookFilters, BookInput, ImportTaskInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerBooksIpc({ books, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(books, 'The book catalog')

  registerIpc(IPC.booksList, (filters: BookFilters = {}) => svc.list(sanitizeBookFilters(filters)), { context: ctx })
  registerIpc(IPC.booksGet, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
    return svc.get(id)
  }, { context: ctx })
  registerIpc(IPC.booksCreate, (input: BookInput) => {
    validateBookInput(input)
    return svc.create(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.booksUpdate, (id: number, input: BookInput) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
    validateBookInput(input)
    return svc.update(id, input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.booksArchive, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
    return svc.archive(id)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.booksRestore, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
    return svc.restore(id)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.booksStats, () => svc.stats(), { context: ctx })
  registerIpc(IPC.booksImportParse, (input: ImportTaskInput) => {
    if (!svc.importParse) throw new Error('Import is not available')
    return svc.importParse(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.booksImportRun, (input: ImportTaskInput) => {
    if (!svc.importRun) throw new Error('Import is not available')
    validateImportInput(input)
    return svc.importRun(input)
  }, { context: ctx, requireAuth: true })
}

function sanitizeBookFilters(filters: BookFilters): BookFilters {
  const out: BookFilters = { ...filters }
  if (out.search != null && typeof out.search !== 'string') out.search = ''
  if (out.category_id != null && typeof out.category_id !== 'number') out.category_id = undefined
  if (out.author_id != null && typeof out.author_id !== 'number') out.author_id = undefined
  if (out.publisher_id != null && typeof out.publisher_id !== 'number') out.publisher_id = undefined
  return out
}

function validateImportInput(input: ImportTaskInput): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid request')
  if (typeof input.fileName !== 'string' || !input.fileName) throw new Error('Missing file name')
  if (!(input.data instanceof ArrayBuffer || input.data instanceof Uint8Array)) {
    throw new Error('Missing file data')
  }
  if (input.data.byteLength > 100 * 1024 * 1024) throw new Error('File is too large (max 100 MB)')
  if (!input.columnMap || typeof input.columnMap !== 'object') throw new Error('Missing column mapping')
  if (typeof input.columnMap.title !== 'string' || !input.columnMap.title.trim()) {
    throw new Error('Map the Title column before importing')
  }
}

function validateBookInput(input: BookInput): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid request')
  if (typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('Title is required')
  }
  if (input.total_copies != null && (!Number.isInteger(input.total_copies) || input.total_copies < 1)) {
    throw new Error('Total copies must be a positive integer')
  }
  if (input.available_copies != null && (!Number.isInteger(input.available_copies) || input.available_copies < 0)) {
    throw new Error('Available copies must be a non-negative integer')
  }
  if (input.publication_year != null && (!Number.isInteger(input.publication_year) || input.publication_year < 0 || input.publication_year > 9999)) {
    throw new Error('Publication year must be a valid year')
  }
}