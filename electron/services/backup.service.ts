import { dialog } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../database/pg/client'
import { toIso } from '../database/pg/repositories/utils'
import { logger } from '../utils/logger'
import type { BackupFile, BackupRestoreResult } from '@shared/types'
import { resolveImagePath } from '../config/paths'

const BACKUP_TABLES = [
  'authors',
  'categories',
  'publishers',
  'books',
  'admin_users',
  'borrowings',
  'settings',
  'schema_migrations'
] as const

const BACKUP_SUFFIX = '.opacbk'
const FORMAT = 'opac-library-backup'
const FORMAT_VERSION = 1

export interface BackupServiceDeps {
  db: Db
  imagesDir: string
  backupsDir: string
  getSchemaVersion: () => Promise<number>
  getLibraryName: () => Promise<string>
  afterRestore?: () => void
}

export interface BackupService {
  create(): Promise<BackupFile>
  list(): Promise<BackupFile[]>
  restore(filename: string): Promise<void>
  pickAndRestore(): Promise<BackupRestoreResult>
}

function safeBasename(name: string): string {
  const safe = name.replaceAll('\\', '/').split('/').pop() ?? ''
  if (!safe || /\.\./.test(safe) || /[:*?"<>|]/.test(safe)) {
    throw new Error('Invalid backup name')
  }
  return safe
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function folderSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    total += statSync(full).size
  }
  return total
}

export function backupService(deps: BackupServiceDeps): BackupService {
  async function dumpData(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {}
    for (const table of BACKUP_TABLES) {
      const rows = await deps.db.many<Record<string, unknown>>(`SELECT * FROM ${table}`)
      out[table] = rows.map((row) => {
        const clean: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row)) {
          clean[key] = value instanceof Date ? value.toISOString() : value
        }
        return clean
      })
    }
    return out
  }

  async function createBackupFolder(): Promise<BackupFile> {
    mkdirSync(deps.backupsDir, { recursive: true })
    const createdAt = new Date().toISOString()
    const folderName = `opac-backup-${stamp()}${BACKUP_SUFFIX}`
    const folder = join(deps.backupsDir, folderName)
    mkdirSync(folder, { recursive: true })
    const coversDir = join(folder, 'covers')
    mkdirSync(coversDir, { recursive: true })

    const [data, schemaVersion, libraryName] = await Promise.all([
      dumpData(),
      deps.getSchemaVersion(),
      deps.getLibraryName()
    ])

    const coverFiles = new Set<string>()
    for (const book of data.books as Array<{ cover_image?: string | null }>) {
      if (book.cover_image) coverFiles.add(book.cover_image)
    }
    for (const filename of coverFiles) {
      try {
        const source = resolveImagePath(deps.imagesDir, filename)
        if (existsSync(source)) {
          copyFileSync(source, join(coversDir, filename))
        }
      } catch {
        // skip unreadable cover
      }
    }

    writeFileSync(
      join(folder, 'manifest.json'),
      JSON.stringify(
        {
          format: FORMAT,
          formatVersion: FORMAT_VERSION,
          createdAt,
          schemaVersion,
          libraryName,
          appVersion: process.env.npm_package_version ?? '1.0.0'
        },
        null,
        2
      ),
      'utf8'
    )
    writeFileSync(join(folder, 'data.json'), JSON.stringify(data), 'utf8')

    logger.info('backup created', { folder: folderName, size: folderSize(folder) })
    return {
      filename: folderName,
      path: folder,
      size: folderSize(folder),
      createdAt
    }
  }

  function readBackup(
    folder: string,
    currentSchemaVersion: number
  ): {
    manifest: { format: string; formatVersion: number; schemaVersion: number }
    data: Record<string, unknown[]>
  } {
    const manifestFile = join(folder, 'manifest.json')
    const dataFile = join(folder, 'data.json')
    if (!existsSync(manifestFile) || !existsSync(dataFile)) {
      throw new Error('The selected backup is missing required files')
    }
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      format: string
      formatVersion: number
      schemaVersion: number
    }
    if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION) {
      throw new Error('This backup was created by an incompatible version')
    }
    if (typeof manifest.schemaVersion === 'number' && manifest.schemaVersion > currentSchemaVersion) {
      throw new Error(
        `This backup uses an unsupported schema version (${manifest.schemaVersion}) and cannot be restored safely`
      )
    }
    const data = JSON.parse(readFileSync(dataFile, 'utf8')) as Record<string, unknown[]>
    for (const table of BACKUP_TABLES) {
      if (!Array.isArray(data[table])) {
        throw new Error(`The backup is missing table data: ${table}`)
      }
    }
    return { manifest, data }
  }

  /** Column names a backup may legally reference for a given table, taken from
   *  the live database schema. Anything else is rejected so a crafted backup
   *  file can never inject SQL through the INSERT column list. */
  async function allowedColumns(table: string): Promise<Set<string>> {
    const rows = await deps.db.many<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    )
    return new Set(rows.map((r) => r.column_name))
  }

  function validateRows(
    table: string,
    rows: Array<Record<string, unknown>>,
    allowed: Set<string>
  ): void {
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (!allowed.has(column)) {
          throw new Error(`The backup contains an unknown column "${column}" in table "${table}"`)
        }
        if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error(`The backup contains an invalid value for "${table}.${column}"`)
        }
      }
    }
  }

  async function applyRestore(folder: string): Promise<void> {
    const currentSchemaVersion = await deps.getSchemaVersion()
    const { data } = readBackup(folder, currentSchemaVersion)

    const schemaVectors = new Map<string, Set<string>>()
    for (const table of BACKUP_TABLES) {
      schemaVectors.set(table, await allowedColumns(table))
    }

    await deps.db.tx(async (tx) => {
      for (const table of BACKUP_TABLES) {
        const rows = data[table]
        if (!rows.length) continue
        validateRows(table, rows as Array<Record<string, unknown>>, schemaVectors.get(table) as Set<string>)
      }

      const tablesToClear = [...BACKUP_TABLES].sort(
        (a, b) => orderOf(b) - orderOf(a)
      )
      for (const table of tablesToClear) {
        await tx.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
      }

      for (const table of BACKUP_TABLES) {
        const rows = data[table]
        if (!rows.length) continue
        const columns = Object.keys(rows[0] as Record<string, unknown>)
        const colList = columns.join(', ')
        for (const row of rows as Array<Record<string, unknown>>) {
          const values = columns.map((c) => row[c] ?? null)
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
          await tx.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values)
        }
      }
    })

    const coversDir = join(folder, 'covers')
    if (existsSync(coversDir)) {
      mkdirSync(deps.imagesDir, { recursive: true })
      for (const filename of readdirSync(coversDir)) {
        try {
          const source = join(coversDir, filename)
          const dest = resolveImagePath(deps.imagesDir, filename)
          copyFileSync(source, dest)
        } catch {
          // skip unreadable cover
        }
      }
    }
  }

  function orderOf(table: string): number {
    return BACKUP_TABLES.indexOf(table as (typeof BACKUP_TABLES)[number])
  }

  return {
    async create(): Promise<BackupFile> {
      return createBackupFolder()
    },
    async list(): Promise<BackupFile[]> {
      if (!existsSync(deps.backupsDir)) return []
      const entries = readdirSync(deps.backupsDir)
        .map((name) => {
          const full = join(deps.backupsDir, name)
          const stat = statSync(full)
          return { name, full, isDir: stat.isDirectory(), stat }
        })
        .filter((e) => e.isDir && e.name.endsWith(BACKUP_SUFFIX))
        .map((e) => {
          let createdAt: string
          try {
            const manifest = JSON.parse(readFileSync(join(e.full, 'manifest.json'), 'utf8')) as {
              createdAt?: string
            }
            createdAt = manifest.createdAt ?? toIso(e.stat.mtime)
          } catch {
            createdAt = toIso(e.stat.mtime)
          }
          const size = folderSize(e.full)
          return {
            filename: e.name,
            path: e.full,
            size,
            createdAt
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return entries
    },
    async restore(filename: string): Promise<void> {
      const safe = safeBasename(filename)
      if (!safe.endsWith(BACKUP_SUFFIX)) throw new Error('Invalid backup file')
      const source = join(deps.backupsDir, safe)
      if (!existsSync(source)) throw new Error('Backup not found')

      // Pre-restore safety snapshot of the current database.
      mkdirSync(deps.backupsDir, { recursive: true })
      const pre = `pre-restore-${Date.now()}${BACKUP_SUFFIX}`
      mkdirSync(join(deps.backupsDir, pre), { recursive: true })
      const snapshot = await dumpData()
      writeFileSync(join(deps.backupsDir, pre, 'data.json'), JSON.stringify(snapshot), 'utf8')
      writeFileSync(
        join(deps.backupsDir, pre, 'manifest.json'),
        JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString() }),
        'utf8'
      )

      await applyRestore(source)
      logger.info('database restored from backup', { source: safe })
      deps.afterRestore?.()
    },
    async pickAndRestore(): Promise<BackupRestoreResult> {
      const result = await dialog.showOpenDialog({
        title: 'Select Backup Folder to Restore',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { restored: false }
      }
      const picked = result.filePaths[0]
      try {
        const currentSchemaVersion = await deps.getSchemaVersion()
        readBackup(picked, currentSchemaVersion)
      } catch (err) {
        return { restored: false, message: err instanceof Error ? err.message : 'Invalid backup' }
      }
      try {
        await applyRestore(picked)
      } catch (err) {
        logger.error('restore failed', err)
        return { restored: false, message: 'Restore failed. The database was not changed.' }
      }
      logger.info('database restored from picked folder', { source: picked })
      deps.afterRestore?.()
      return { restored: true }
    }
  }
}