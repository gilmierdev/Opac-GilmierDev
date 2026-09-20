import { dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { AppDirs } from '../config/paths'
import { logger } from '../utils/logger'

const REQUIRED_TABLES = ['schema_migrations', 'authors', 'categories', 'publishers', 'books', 'admin_users', 'borrowings', 'settings']

export interface BackupResult {
  filename: string
  path: string
  size: number
  createdAt: string
}

export interface BackupService {
  create(): Promise<BackupResult>
  list(): BackupResult[]
  restoreFromFile(filename: string): Promise<void>
  pickAndRestore(): Promise<{ restored: boolean; message?: string }>
}

export function backupService(
  dirs: AppDirs,
  getDbPath: () => string | null,
  checkpoint: () => void,
  afterRestore?: () => void
): BackupService {
  function validateDatabase(filePath: string): string | null {
    try {
      if (!existsSync(filePath)) return 'File does not exist'
      const candidate = new Database(filePath, { readonly: true, fileMustExist: true })
      try {
        const integrity = candidate.pragma('integrity_check') as Array<{ integrity_check: string }>
        if (!integrity || integrity[0]?.integrity_check !== 'ok') {
          return 'The selected file is not a valid database'
        }
        const tables = (candidate
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>).map((t) => t.name)
        const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t))
        if (missing.length > 0) {
          return `The selected file is missing required tables: ${missing.join(', ')}`
        }
        return null
      } finally {
        candidate.close()
      }
    } catch (err) {
      logger.error('backup validation failed', err)
      return 'The selected file is not a valid database'
    }
  }

  return {
    async create() {
      const dbPath = getDbPath()
      if (!dbPath || !existsSync(dbPath)) {
        throw new Error('Database not found')
      }
      try {
        checkpoint()
      } catch {
        // checkpoint is best-effort
      }
      mkdirSync(dirs.backupsDir, { recursive: true })
      const stamp = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `opac-backup-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}.db`
      const dest = join(dirs.backupsDir, filename)
      copyFileSync(dbPath, dest)
      const stat = statSync(dest)
      logger.info('backup created', { filename, size: stat.size })
      return {
        filename,
        path: dest,
        size: stat.size,
        createdAt: new Date().toISOString()
      }
    },

    list() {
      if (!existsSync(dirs.backupsDir)) return []
      const files = readdirSync(dirs.backupsDir)
        .filter((f) => f.endsWith('.db'))
        .map((filename) => {
          const full = join(dirs.backupsDir, filename)
          const stat = statSync(full)
          return {
            filename,
            path: full,
            size: stat.size,
            createdAt: stat.mtime.toISOString()
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return files
    },

    async restoreFromFile(filename: string) {
      const safeName = filename.replaceAll('\\', '/').split('/').pop() ?? ''
      if (!safeName || safeName !== filename || /\.\./.test(safeName)) {
        throw new Error('Invalid backup filename')
      }
      const source = join(dirs.backupsDir, safeName)
      const error = validateDatabase(source)
      if (error) {
        throw new Error(error)
      }
      const dbPath = getDbPath()
      if (!dbPath) {
        throw new Error('Database not found')
      }
      mkdirSync(dirs.backupsDir, { recursive: true })
      const backupBeforeRestore = join(
        dirs.backupsDir,
        `pre-restore-${Date.now()}.db`
      )
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, backupBeforeRestore)
      }
      copyFileSync(source, dbPath)
      logger.info('database restored', { source: safeName })
      afterRestore?.()
    },

    async pickAndRestore() {
      const result = await dialog.showOpenDialog({
        title: 'Select Database Backup to Restore',
        properties: ['openFile'],
        filters: [
          { name: 'Database Backup', extensions: ['db', 'sqlite', 'sqlite3', 'bak', '*'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { restored: false }
      }
      const picked = result.filePaths[0]
      const error = validateDatabase(picked)
      if (error) {
        return { restored: false, message: error }
      }
      const dbPath = getDbPath()
      if (!dbPath) {
        return { restored: false, message: 'Database not found' }
      }
      mkdirSync(dirs.backupsDir, { recursive: true })
      const backupBeforeRestore = join(dirs.backupsDir, `pre-restore-${Date.now()}.db`)
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, backupBeforeRestore)
      }
      copyFileSync(picked, dbPath)
      logger.info('database restored from file picker', { source: picked })
      afterRestore?.()
      return { restored: true }
    }
  }
}