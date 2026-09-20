import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '../utils/logger'

export type DB = Database.Database

let activeDb: DB | null = null
let activePath: string | null = null

export function openDatabase(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true })
  closeDatabase()

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')

  activeDb = db
  activePath = dbPath
  logger.info('database opened', { path: dbPath })
  return db
}

export function getDatabase(): DB {
  if (!activeDb) {
    throw new Error('Database is not initialized')
  }
  return activeDb
}

export function getDatabasePath(): string | null {
  return activePath
}

export function closeDatabase(): void {
  if (activeDb) {
    try {
      activeDb.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // ignore
    }
    activeDb.close()
    logger.info('database closed')
  }
  activeDb = null
  activePath = null
}