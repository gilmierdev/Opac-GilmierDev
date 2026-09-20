import type { DB } from './connection'
import { logger } from '../utils/logger'

interface Migration {
  id: number
  name: string
  up: (db: DB) => void
}

const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE authors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          biography TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE publishers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          address TEXT,
          website TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE books (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          isbn TEXT,
          author_id INTEGER,
          category_id INTEGER,
          publisher_id INTEGER,
          publication_year INTEGER,
          edition TEXT,
          subject TEXT,
          description TEXT,
          call_number TEXT,
          shelf_location TEXT,
          total_copies INTEGER NOT NULL DEFAULT 1,
          available_copies INTEGER NOT NULL DEFAULT 1,
          cover_image TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,

          FOREIGN KEY(author_id)
            REFERENCES authors(id)
            ON DELETE SET NULL,

          FOREIGN KEY(category_id)
            REFERENCES categories(id)
            ON DELETE SET NULL,

          FOREIGN KEY(publisher_id)
            REFERENCES publishers(id)
            ON DELETE SET NULL
        );

        CREATE TABLE admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE borrowings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          book_id INTEGER NOT NULL,
          borrower_name TEXT NOT NULL,
          borrower_id TEXT,
          borrowed_at TEXT NOT NULL,
          due_date TEXT,
          returned_at TEXT,
          status TEXT NOT NULL DEFAULT 'borrowed',

          FOREIGN KEY(book_id)
            REFERENCES books(id)
            ON DELETE RESTRICT
        );

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `)

      db.exec(`
        CREATE INDEX idx_books_title ON books(title);
        CREATE INDEX idx_books_isbn ON books(isbn);
        CREATE INDEX idx_books_author_id ON books(author_id);
        CREATE INDEX idx_books_category_id ON books(category_id);
        CREATE INDEX idx_books_publisher_id ON books(publisher_id);
        CREATE INDEX idx_books_publication_year ON books(publication_year);
        CREATE INDEX idx_books_available_copies ON books(available_copies);
        CREATE INDEX idx_borrowings_status ON borrowings(status);
        CREATE INDEX idx_borrowings_borrower_name ON borrowings(borrower_name);
        CREATE INDEX idx_borrowings_book_id ON borrowings(book_id);
      `)
    }
  },
  {
    id: 2,
    name: 'fts5_search',
    up: (db) => {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
          title,
          isbn,
          subject,
          description,
          call_number,
          content='books',
          content_rowid='id',
          tokenize='unicode61'
        );

        CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
          INSERT INTO books_fts(rowid, title, isbn, subject, description, call_number)
          VALUES (new.id, new.title, coalesce(new.isbn,''), coalesce(new.subject,''), coalesce(new.description,''), coalesce(new.call_number,''));
        END;

        CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
          INSERT INTO books_fts(books_fts, rowid, title, isbn, subject, description, call_number)
          VALUES('delete', old.id, old.title, coalesce(old.isbn,''), coalesce(old.subject,''), coalesce(old.description,''), coalesce(old.call_number,''));
        END;

        CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
          INSERT INTO books_fts(books_fts, rowid, title, isbn, subject, description, call_number)
          VALUES('delete', old.id, old.title, coalesce(old.isbn,''), coalesce(old.subject,''), coalesce(old.description,''), coalesce(old.call_number,''));
          INSERT INTO books_fts(rowid, title, isbn, subject, description, call_number)
          VALUES (new.id, new.title, coalesce(new.isbn,''), coalesce(new.subject,''), coalesce(new.description,''), coalesce(new.call_number,''));
        END;
      `)
    }
  },
  {
    id: 3,
    name: 'archive_authors_categories_publishers',
    up: (db) => {
      const add = (table: string) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        const has = cols.some((c) => c.name === 'is_archived')
        if (!has) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`)
        }
      }
      add('authors')
      add('categories')
      add('publishers')
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_authors_is_archived ON authors(is_archived);
        CREATE INDEX IF NOT EXISTS idx_categories_is_archived ON categories(is_archived);
        CREATE INDEX IF NOT EXISTS idx_publishers_is_archived ON publishers(is_archived);
      `)
    }
  },
  {
    id: 4,
    name: 'unique_isbn',
    up: (db) => {
      db.exec(`
        UPDATE books
        SET isbn = NULL
        WHERE isbn IS NOT NULL
          AND isbn != ''
          AND id NOT IN (
            SELECT MIN(id) FROM books
            WHERE isbn IS NOT NULL AND isbn != ''
            GROUP BY lower(trim(isbn))
          );
      `)
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn_unique
        ON books(isbn) WHERE isbn IS NOT NULL AND isbn != '';
      `)
    }
  }
]

export function getCurrentVersion(db: DB): number {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`
    )
    .get() as { name: string } | undefined
  if (!table) {
    return 0
  }
  const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as {
    v: number | null
  }
  return row.v ?? 0
}

export function runMigrations(db: DB): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const current = getCurrentVersion(db)
  let applied = 0

  for (const migration of migrations) {
    if (migration.id <= current) continue
    const tx = db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString()
      )
    })
    tx()
    applied += 1
    logger.info('migration applied', { id: migration.id, name: migration.name })
  }

  return applied
}