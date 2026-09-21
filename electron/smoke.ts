import { join } from 'node:path'
import { rmSync, mkdirSync } from 'node:fs'
import type { SystemDirs } from './config/paths'
import { pgDb } from './database/pg/client'
import { provisioner } from './database/pg/provision'
import { runMigrations, currentSchemaVersion } from './database/pg/migrations'
import { repositories, type Repositories } from './database/pg/repositories'
import { authService, type AuthService } from './services/auth.service'
import type { Db } from './database/pg/client'

interface SmokeOptions {
  dir: string
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Removes a directory, retrying briefly to let lingering postgres file handles close. */
async function removeDirSafe(path: string): Promise<void> {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch {
      await sleep(300)
    }
  }
}

async function withPostgres<T>(
  dirs: SystemDirs,
  fn: (db: Db, repo: Repositories) => Promise<T>
): Promise<T> {
  const prov = provisioner(dirs)
  const info = await prov.ensure()
  const db = pgDb({
    host: '127.0.0.1',
    port: info.port,
    user: info.appUser,
    password: info.appUserPassword,
    database: info.database
  })
  try {
    return await fn(db, repositories(db))
  } finally {
    await db.end()
    await prov.stop()
  }
}

export async function runSmoke(options: SmokeOptions): Promise<void> {
  console.log('[smoke] starting PostgreSQL smoke test')

  const root = options.dir
  await removeDirSafe(root)
  mkdirSync(join(root, 'database', 'pgdata'), { recursive: true })
  mkdirSync(join(root, 'book-covers'), { recursive: true })
  mkdirSync(join(root, 'backups'), { recursive: true })
  mkdirSync(join(root, 'logs'), { recursive: true })

  const dirs: SystemDirs = {
    root,
    databaseDir: join(root, 'database'),
    pgDataDir: join(root, 'database', 'pgdata'),
    imagesDir: join(root, 'book-covers'),
    backupsDir: join(root, 'backups'),
    logsDir: join(root, 'logs'),
    configFile: join(root, 'config.json')
  }

  await withPostgres(dirs, async (db, repo) => {
    const applied = await runMigrations(db)
    assert(applied >= 1, `migrations should run, applied=${applied}`)
    const schemaVersion = await currentSchemaVersion(db)
    assert(schemaVersion >= 1, 'schema version should be set')

    // Idempotent migrations across a fresh connection.
    const applied2 = await runMigrations(db)
    assert(applied2 === 0, 'migrations should be idempotent')

    // ---- Seed helper data ----
    const author = await repo.authors.create({ name: 'Grace Hopper', biography: 'computer science pioneer' })
    const category = await repo.categories.create({ name: 'Computing', description: 'computers' })
    const publisher = await repo.publishers.create({ name: 'MIT Press', address: 'Cambridge', website: 'mitpress.edu' })
    assert(author.book_count === 0, 'new author starts with 0 books')

    const book = await repo.books.create({
      title: 'Compilers: Principles and Practice',
      isbn: '9781234567890',
      author_id: author.id,
      category_id: category.id,
      publisher_id: publisher.id,
      publication_year: 2020,
      total_copies: 2,
      available_copies: 2,
      call_number: 'QA76'
    })
    assert(book.id > 0 && book.available, 'created book should be available')
    assert(book.author_name === 'Grace Hopper', 'author join should resolve')

    const listAll = await repo.books.list({ page: 1, pageSize: 10 })
    assert(listAll.total === 1, `expected 1 book, got ${listAll.total}`)

    const search = await repo.books.list({ search: 'compilers', page: 1, pageSize: 10 })
    assert(search.total >= 1, 'ILIKE search should find compilers')

    const dupIsbnThrew = await repo.books
      .create({ title: 'Duplicate', isbn: '9781234567890', total_copies: 1, available_copies: 1 })
      .then(() => false)
      .catch(() => true)
    assert(dupIsbnThrew, 'duplicate ISBN must be rejected')

    const badCopiesThrew = await repo.books
      .create({ title: 'Bad', total_copies: 0 })
      .then(() => false)
      .catch(() => true)
    assert(badCopiesThrew, 'total_copies < 1 must be rejected')

    const updated = await repo.books.update(book.id, { title: 'Compilers Updated', total_copies: 3 })
    assert(updated.title === 'Compilers Updated' && updated.total_copies === 3, 'update persists')
    assert(updated.available_copies === 2, 'available preserved when not provided')

    // ---- Borrowings / concurrency-safe availability ----
    const b1 = await repo.borrowings.create({
      book_id: book.id,
      borrower_name: 'Alice',
      borrower_id: 'A-001',
      borrowed_at: new Date().toISOString(),
      due_date: '2025-12-01'
    })
    assert((await repo.books.getById(book.id))?.available_copies === 1, 'borrowing decrements availability')
    const b2 = await repo.borrowings.create({
      book_id: book.id,
      borrower_name: 'Bob',
      borrowed_at: new Date().toISOString()
    })
    assert((await repo.books.getById(book.id))?.available_copies === 0, 'second borrowing decrements to 0')

    const thirdThrew = await repo.borrowings
      .create({ book_id: book.id, borrower_name: 'Charlie', borrowed_at: new Date().toISOString() })
      .then(() => false)
      .catch(() => true)
    assert(thirdThrew, 'borrowing with 0 available must be rejected')

    assert(b2.status === 'borrowed', 'b2 should be borrowed')
    await repo.borrowings.recordReturn(b2.id)
    assert((await repo.books.getById(book.id))?.available_copies === 1, 'return increments availability')
    const returned = await repo.borrowings.getById(b2.id)
    assert(returned?.status === 'returned', 'returned status persisted')
    assert(b1.status === 'overdue', 'b1 with past due date should be overdue')

    // ---- Archive / restore ----
    const archived = await repo.books.archive(book.id)
    assert(archived.is_archived, 'book should be archived')
    const publicList = await repo.books.list({ page: 1, pageSize: 10 })
    assert(publicList.total === 0, 'archived book excluded from public list')
    await repo.books.restore(book.id)
    assert((await repo.books.getById(book.id))?.is_archived === false, 'book restored')

    // ---- Auth ----
    await testAuth(repo)
  })

  await removeDirSafe(root)
  console.log('[smoke] all PostgreSQL smoke tests passed')
}

async function testAuth(repo: Repositories): Promise<void> {
  const auth: AuthService = authService(repo)

  assert((await auth.needsSetup()) === true, 'fresh DB should need setup')
  const createdAdmin = await auth.setup({ username: 'admin', password: 'StrongPass1', full_name: 'Test Admin' })
  assert(createdAdmin.id > 0, 'first admin created')
  assert((await auth.needsSetup()) === false, 'after setup, no longer needs setup')

  const logged = await auth.login('admin', 'StrongPass1')
  assert(logged.username === 'admin', 'login succeeds with correct password')
  let loginThrew = false
  try {
    await auth.login('admin', 'WrongPassword')
  } catch {
    loginThrew = true
  }
  assert(loginThrew, 'login with wrong password rejects')
  assert((await auth.getSession())?.username === 'admin', 'session is active after login')
  await auth.changePassword('StrongPass1', 'NewStrongPass1')
  assert((await auth.login('admin', 'NewStrongPass1')).username === 'admin', 'login succeeds with new password')
  await auth.logout()
  assert((await auth.getSession()) === null, 'session cleared after logout')
}