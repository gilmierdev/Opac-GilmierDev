import { join } from 'node:path'
import { rmSync, mkdirSync } from 'node:fs'
import { openDatabase, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { seedDatabase } from './database/seed'
import { booksRepository } from './database/repositories/books.repository'
import { authorsRepository } from './database/repositories/authors.repository'
import { categoriesRepository } from './database/repositories/categories.repository'
import { publishersRepository } from './database/repositories/publishers.repository'
import { borrowingsRepository } from './database/repositories/borrowings.repository'
import { authService } from './services/auth.service'
import type { DB } from './database/connection'

interface SmokeOptions {
  dir: string
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

export async function runSmoke(options: SmokeOptions): Promise<void> {
  console.log('[smoke] starting database smoke test')

  const dbPath = join(options.dir, 'data', 'opac.db')
  rmSync(options.dir, { recursive: true, force: true })
  mkdirSync(join(options.dir, 'data'), { recursive: true })
  mkdirSync(join(options.dir, 'book-images'), { recursive: true })

  const db: DB = openDatabase(dbPath)
  const migrationsApplied = runMigrations(db)
  assert(migrationsApplied >= 1, 'migrations should run')

  closeDatabase()
  const reopened: DB = openDatabase(dbPath)
  const nextRun = runMigrations(reopened)
  assert(nextRun === 0, 'migrations should be idempotent')

  seedDatabase(reopened, { imagesDir: join(options.dir, 'book-images'), isDev: true })
  const books = booksRepository(reopened)
  assert(books.countAll() === 10, `expected 10 seeded books, got ${books.countAll()}`)

  const found = books.list({ search: 'program', page: 1, pageSize: 10 })
  assert(found.total >= 4, `search "program" should find >= 4, got ${found.total}`)
  const exactIsbn = books.list({ search: '9780262033848', page: 1, pageSize: 10 })
  assert(exactIsbn.total === 1, 'ISBN search should find 1')

  const created = books.create({ title: 'Smoke Test Book', isbn: '9990000000000', total_copies: 2, available_copies: 2 })
  assert(created.id > 0 && created.available, 'created book should be available')
  const updated = books.update(created.id, { title: 'Smoke Updated', total_copies: 3 })
  assert(updated.title === 'Smoke Updated' && updated.total_copies === 3, 'update persists')
  assert(updated.available_copies === 2, 'available preserved when not provided')

  let threw = false
  try {
    books.create({ title: 'Bad', total_copies: 0 })
  } catch {
    threw = true
  }
  assert(threw, 'total_copies < 1 must be rejected')

  threw = false
  try {
    books.create({ title: 'Dup', isbn: '9990000000000' })
  } catch {
    threw = true
  }
  assert(threw, 'duplicate ISBN must be rejected')

  const authors = authorsRepository(reopened)
  const authorCount = authors.list().length
  assert(authorCount === 5, `expected 5 authors, got ${authorCount}`)
  const newAuthor = authors.create({ name: 'Test Author', biography: 'bio' })
  assert(newAuthor.book_count === 0, 'new author has 0 books')
  authors.update(newAuthor.id, { name: 'Test Author 2' })
  assert(authors.getById(newAuthor.id)?.name === 'Test Author 2', 'author update persists')
  authors.archive(newAuthor.id)
  assert(authors.list().length === authorCount, 'archived author excluded from list')
  assert(authors.list(true).length === authorCount + 1, 'archived author included with showArchived')

  const categories = categoriesRepository(reopened)
  const publishers = publishersRepository(reopened)
  assert(categories.list().length === 5, 'expected 5 categories')
  assert(publishers.list().length === 3, 'expected 3 publishers')

  const borrowings = borrowingsRepository(reopened)
  const target = books.getById(created.id)!
  assert(target.available_copies === 2, 'target book should have 2 available')
  const b1 = borrowings.create({ book_id: created.id, borrower_name: 'Alice', borrowed_at: new Date().toISOString(), due_date: '2026-01-01' })
  assert(books.getById(created.id)!.available_copies === 1, 'borrowing decrements availability')
  const b2 = borrowings.create({ book_id: created.id, borrower_name: 'Bob', borrowed_at: new Date().toISOString() })
  assert(books.getById(created.id)!.available_copies === 0, 'second borrowing decrements to 0')

  threw = false
  try {
    borrowings.create({ book_id: created.id, borrower_name: 'Charlie', borrowed_at: new Date().toISOString() })
  } catch {
    threw = true
  }
  assert(threw, 'borrowing with 0 available must be rejected')

  assert(b2.status === 'borrowed', 'b2 should be borrowed')
  borrowings.recordReturn(b2.id)
  assert(books.getById(created.id)!.available_copies === 1, 'return increments availability')
  const returned = borrowings.getById(b2.id)
  assert(returned?.status === 'returned', 'returned status persisted')

  assert(b1.status === 'overdue', 'b1 with past due date should be overdue')

  // ---- Archive book flow ----
  const archived = books.archive(created.id)
  assert(archived.is_archived, 'book should be archived')
  assert(books.countAll() === 10, 'archived book excluded from count')
  const withArchived = books.list({ includeArchived: true, page: 1, pageSize: 100 })
  assert(withArchived.total > 10, 'archived book included when includeArchived')
  books.restore(created.id)
  assert(books.getById(created.id)?.is_archived === false, 'book restored')

  // ---- Auth ----
  const auth = authService(() => reopened)
  assert(auth.needsSetup() === true, 'dev-seeded DB with no admin should need setup')
  const createdAdmin = auth.setup({ username: 'admin', password: 'StrongPass1', full_name: 'Test Admin' })
  assert(createdAdmin.id > 0, 'first admin created')
  assert(auth.needsSetup() === false, 'after setup, no longer needs setup')
  const logged = auth.login('admin', 'StrongPass1')
  assert(logged.username === 'admin', 'login succeeds with correct password')
  let loginThrew = false
  try {
    auth.login('admin', 'WrongPassword')
  } catch {
    loginThrew = true
  }
  assert(loginThrew, 'login with wrong password rejects')
  assert(auth.getSession()?.username === 'admin', 'session is active after login')
  auth.changePassword('StrongPass1', 'NewStrongPass1')
  assert(auth.login('admin', 'NewStrongPass1').username === 'admin', 'login succeeds with new password')
  auth.logout()
  assert(auth.getSession() === null, 'session cleared after logout')

  closeDatabase()

  rmSync(options.dir, { recursive: true, force: true })
  console.log('[smoke] all database smoke tests passed')
}