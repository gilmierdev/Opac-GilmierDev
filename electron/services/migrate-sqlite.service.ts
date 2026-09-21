import { existsSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Db } from '../database/pg/client'
import type { Repositories } from '../database/pg/repositories'
import { resolveImagePath } from '../config/paths'
import { logger } from '../utils/logger'

const LEGACY_MIGRATED_KEY = 'legacy_sqlite_migrated'

export interface MigrateReport {
  migrated: boolean
  counts: Record<string, number>
  warnings: string[]
}

function booleanValue(v: unknown): boolean {
  return v === 1 || v === true || v === '1' || v === 'true'
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function clampCopies(total: number, available: number): { total: number; available: number } {
  let t = intOr(total, 1)
  let a = intOr(available, t)
  if (t < 1) t = 1
  if (a < 0) a = 0
  if (a > t) a = t
  return { total: t, available: a }
}

export async function migrateSqliteFrom(opts: {
  db: Db
  repo: Repositories
  sqlitePath: string
  imagesDir: string
}): Promise<MigrateReport> {
  const { db, sqlitePath, imagesDir } = opts

  if (!existsSync(sqlitePath)) {
    return { migrated: false, counts: {}, warnings: ['No legacy database found to migrate'] }
  }

  const already = await opts.repo.settings.get(LEGACY_MIGRATED_KEY)
  if (already === '1') {
    return { migrated: false, counts: {}, warnings: ['Legacy data was already migrated in a previous run'] }
  }

  const existing = (await db.one<{ c: number }>('SELECT COUNT(*)::int AS c FROM books'))?.c ?? 0
  if (existing > 0) {
    throw new Error('The database already contains book records. Migration was skipped to avoid duplicates.')
  }

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true })
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  const seenIsbn = new Map<string, number>()

  try {
    return await db.tx(async (tx) => {
      const hasTable = (table: string): boolean => {
        const row = sqlite
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(table)
        return Boolean(row)
      }

      const load = <T>(table: string): T[] => {
        if (!hasTable(table)) return []
        return sqlite.prepare(`SELECT * FROM ${table}`).all() as T[]
      }

      // ---------------------------------------------------------------------
      // authors / categories / publishers
      // ---------------------------------------------------------------------
      const simpleNames = ['authors', 'categories', 'publishers'] as const
      for (const table of simpleNames) {
        if (!hasTable(table)) {
          warnings.push(`Legacy table "${table}" not found, skipped`)
          continue
        }
        const rows = load<Record<string, unknown>>(table)
        counts[table] = 0
        for (const row of rows) {
          await tx.query(
            `INSERT INTO ${table} (id, name, biography, is_archived, created_at)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
            [
              intOr(row.id, 0),
              String(row.name ?? '').trim() || '(unnamed)',
              row.biography != null ? String(row.biography) : null,
              booleanValue(row.is_archived),
              row.created_at ?? new Date().toISOString()
            ]
          )
          counts[table] += 1
        }
      }

      // ---------------------------------------------------------------------
      // books (clamp copies, dedupe isbn against unique partial index)
      // ---------------------------------------------------------------------
      if (hasTable('books')) {
        const rows = load<Record<string, unknown>>('books')
        counts.books = 0
        for (const row of rows) {
          const copies = clampCopies(
            Number(row.total_copies),
            Number(row.available_copies)
          )
          let isbn = row.isbn != null ? String(row.isbn).trim() : ''
          if (isbn) {
            const existingId = seenIsbn.get(isbn)
            if (existingId !== undefined) {
              warnings.push(`Duplicate ISBN "${isbn}" on book ${String(row.title ?? '')} left blank`)
              isbn = ''
            } else {
              seenIsbn.set(isbn, intOr(row.id, 0))
            }
          }
          await tx.query(
            `INSERT INTO books (
              id, title, isbn, author_id, category_id, publisher_id, publication_year,
              edition, subject, description, call_number, shelf_location,
              total_copies, available_copies, cover_image, is_archived, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            ON CONFLICT (id) DO NOTHING`,
            [
              intOr(row.id, 0),
              String(row.title ?? ''),
              isbn || null,
              row.author_id != null ? intOr(row.author_id, 0) : null,
              row.category_id != null ? intOr(row.category_id, 0) : null,
              row.publisher_id != null ? intOr(row.publisher_id, 0) : null,
              row.publication_year != null ? intOr(row.publication_year, 0) : null,
              row.edition != null ? String(row.edition) : null,
              row.subject != null ? String(row.subject) : null,
              row.description != null ? String(row.description) : null,
              row.call_number != null ? String(row.call_number) : null,
              row.shelf_location != null ? String(row.shelf_location) : null,
              copies.total,
              copies.available,
              row.cover_image != null ? String(row.cover_image) : null,
              booleanValue(row.is_archived),
              row.created_at ?? new Date().toISOString(),
              row.updated_at ?? new Date().toISOString()
            ]
          )
          counts.books += 1
        }
      }

      // ---------------------------------------------------------------------
      // admin_users
      // ---------------------------------------------------------------------
      if (hasTable('admin_users')) {
        const rows = load<Record<string, unknown>>('admin_users')
        counts.admin_users = 0
        for (const row of rows) {
          await tx.query(
            `INSERT INTO admin_users (id, username, password_hash, full_name, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            [
              intOr(row.id, 0),
              String(row.username ?? '').trim(),
              String(row.password_hash ?? ''),
              row.full_name != null ? String(row.full_name) : null,
              row.created_at ?? new Date().toISOString(),
              row.updated_at ?? new Date().toISOString()
            ]
          )
          counts.admin_users += 1
        }
      }

      // ---------------------------------------------------------------------
      // borrowings
      // ---------------------------------------------------------------------
      if (hasTable('borrowings')) {
        const rows = load<Record<string, unknown>>('borrowings')
        counts.borrowings = 0
        for (const row of rows) {
          const status = String(row.status ?? 'borrowed')
          const safeStatus = status === 'returned' ? 'returned' : 'borrowed'
          await tx.query(
            `INSERT INTO borrowings (
              id, book_id, borrower_name, borrower_id, borrowed_at, due_date, returned_at, status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (id) DO NOTHING`,
            [
              intOr(row.id, 0),
              intOr(row.book_id, 0),
              String(row.borrower_name ?? ''),
              row.borrower_id != null ? String(row.borrower_id) : null,
              row.borrowed_at ?? new Date().toISOString(),
              row.due_date != null ? String(row.due_date).slice(0, 10) : null,
              row.returned_at != null ? String(row.returned_at) : null,
              safeStatus
            ]
          )
          counts.borrowings += 1
        }
      }

      // ---------------------------------------------------------------------
      // settings (excluding internal migration marker)
      // ---------------------------------------------------------------------
      if (hasTable('settings')) {
        const rows = load<{ key?: string; value?: unknown }>('settings')
        counts.settings = 0
        for (const row of rows) {
          if (!row.key || String(row.key).startsWith('legacy_')) continue
          await tx.query(
            `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
            [String(row.key), row.value != null ? String(row.value) : null]
          )
          counts.settings += 1
        }
      }

      await tx.query(`INSERT INTO settings (key, value) VALUES ($1, '1') ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [
        LEGACY_MIGRATED_KEY
      ])

      // ---------------------------------------------------------------------
      // book cover images
      // ---------------------------------------------------------------------
      const legacyImagesDir = join(orgImagesDir(sqlitePath))
      if (existsSync(legacyImagesDir)) {
        mkdirSync(imagesDir, { recursive: true })
        for (const filename of readdirSync(legacyImagesDir)) {
          try {
            const source = resolveImagePath(legacyImagesDir, filename)
            const dest = resolveImagePath(imagesDir, filename)
            copyFileSync(source, dest)
          } catch {
            // skip unreadable cover
          }
        }
      }

      for (const [table, count] of Object.entries(counts)) {
        logger.info('legacy migration', { table, count })
      }
      return { migrated: true, counts, warnings }
    })
  } finally {
    sqlite.close()
  }
}

/** Legacy images live next to the sqlite file inside userData. */
function orgImagesDir(dbPath: string): string {
  return join(dbPath, '..', '..', 'book-images')
}