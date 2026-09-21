import type { Db, Queryable } from './client'
import { logger } from '../../utils/logger'

export interface Migration {
  id: number
  name: string
  up: (db: Queryable) => Promise<void>
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    up: async (db) => {
      await db.query(`
        CREATE EXTENSION IF NOT EXISTS pg_trgm;

        CREATE TABLE authors (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          biography TEXT,
          is_archived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE categories (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          is_archived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE publishers (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          address TEXT,
          website TEXT,
          is_archived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE books (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          isbn TEXT,
          author_id BIGINT REFERENCES authors(id) ON DELETE SET NULL,
          category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
          publisher_id BIGINT REFERENCES publishers(id) ON DELETE SET NULL,
          publication_year INTEGER CHECK (publication_year IS NULL OR (publication_year >= 0 AND publication_year <= 9999)),
          edition TEXT,
          subject TEXT,
          description TEXT,
          call_number TEXT,
          shelf_location TEXT,
          total_copies INTEGER NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
          available_copies INTEGER NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
          cover_image TEXT,
          is_archived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chk_copies_available_le_total CHECK (available_copies <= total_copies)
        );

        CREATE TABLE admin_users (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE borrowings (
          id BIGSERIAL PRIMARY KEY,
          book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
          borrower_name TEXT NOT NULL,
          borrower_id TEXT,
          borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          due_date DATE,
          returned_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'borrowed' CHECK (status IN ('borrowed', 'returned'))
        );

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `)

      await db.query(`
        CREATE INDEX idx_books_title ON books(title);
        CREATE INDEX idx_books_isbn ON books(isbn);
        CREATE INDEX idx_books_author_id ON books(author_id);
        CREATE INDEX idx_books_category_id ON books(category_id);
        CREATE INDEX idx_books_publisher_id ON books(publisher_id);
        CREATE INDEX idx_books_publication_year ON books(publication_year);
        CREATE INDEX idx_books_available_copies ON books(available_copies);
        CREATE INDEX idx_books_is_archived ON books(is_archived);
        CREATE INDEX idx_books_title_trgm ON books USING gin (title gin_trgm_ops);
        CREATE INDEX idx_books_isbn_trgm ON books USING gin (isbn gin_trgm_ops);
        CREATE INDEX idx_books_subject_trgm ON books USING gin (subject gin_trgm_ops);
        CREATE INDEX idx_books_call_number_trgm ON books USING gin (call_number gin_trgm_ops);

        CREATE UNIQUE INDEX idx_books_isbn_unique ON books(isbn) WHERE isbn IS NOT NULL AND isbn <> '';

        CREATE INDEX idx_authors_is_archived ON authors(is_archived);
        CREATE INDEX idx_authors_name_trgm ON authors USING gin (name gin_trgm_ops);
        CREATE INDEX idx_categories_is_archived ON categories(is_archived);
        CREATE INDEX idx_publishers_is_archived ON publishers(is_archived);

        CREATE INDEX idx_borrowings_status ON borrowings(status);
        CREATE INDEX idx_borrowings_borrower_name ON borrowings(borrower_name);
        CREATE INDEX idx_borrowings_book_id ON borrowings(book_id);
        CREATE INDEX idx_borrowings_borrowed_at ON borrowings(borrowed_at);
      `)
    }
  }
]

async function ensureMigrationTable(db: Db): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function getCurrentVersion(db: Db): Promise<number> {
  await ensureMigrationTable(db)
  const row = await db.one<{ v: number | null }>(
    'SELECT MAX(version)::int AS v FROM schema_migrations'
  )
  return row?.v ?? 0
}

/** Applies all pending migrations inside individual transactions. */
export async function runMigrations(db: Db): Promise<number> {
  await ensureMigrationTable(db)
  const current = await getCurrentVersion(db)
  let applied = 0
  for (const migration of migrations) {
    if (migration.id <= current) continue
    await db.tx(async (tx) => {
      await migration.up(tx)
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
        migration.id,
        migration.name
      ])
    })
    applied += 1
    logger.info('migration applied', { id: migration.id, name: migration.name })
  }
  return applied
}

export async function currentSchemaVersion(db: Db): Promise<number> {
  try {
    return await getCurrentVersion(db)
  } catch {
    return 0
  }
}