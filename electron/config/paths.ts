import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

export interface AppDirs {
  userData: string
  dataDir: string
  dbPath: string
  imagesDir: string
  backupsDir: string
  logsDir: string
}

export function getAppDirs(): AppDirs {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'data')
  const imagesDir = join(userData, 'book-images')
  const backupsDir = join(userData, 'backups')
  const logsDir = join(userData, 'logs')
  return {
    userData,
    dataDir,
    dbPath: join(dataDir, 'opac.db'),
    imagesDir,
    backupsDir,
    logsDir
  }
}

export function ensureDirs(dirs: AppDirs): void {
  for (const dir of [
    dirs.userData,
    dirs.dataDir,
    dirs.imagesDir,
    dirs.backupsDir,
    dirs.logsDir
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function backslashToWindows(p: string): string {
  return p.replaceAll('/', '\\')
}

export function resolveImagePath(dirs: AppDirs, filename: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const base = normalized.split('/').pop() ?? ''
  if (!base || base !== filename) {
    throw new Error('Invalid image filename')
  }
  if (/\.\./.test(base)) {
    throw new Error('Invalid image filename')
  }
  return join(dirs.imagesDir, base)
}

export function homeDir(): string {
  return homedir()
}