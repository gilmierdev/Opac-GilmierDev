import { app, BrowserWindow, protocol, net, session, dialog } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import { getAppDirs, ensureDirs, ensureSystemDirs, getSystemDirs, resolveImagePath } from './config/paths'
import { getAppMode } from './config/mode'
import type { AppMode, ConnectionConfig } from '@shared/types'
import { initLogger, logger } from './utils/logger'
import { provisioner } from './database/pg/provision'
import type { Db } from './database/pg/client'
import { registerAllIpc } from './ipc'
import { setIpcSenderValidator } from './ipc/register'
import type { Services } from './ipc/types'
import { buildAdminServices } from './services/admin.services'
import { buildUserServices } from './services/user.services'
import { migrateSqliteFrom } from './services/migrate-sqlite.service'
import { IPC } from '../shared/api'

const IMAGE_SCHEME = 'opac-img'

protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let appServices: Services | null = null
let adminDb: Db | null = null

/** Restricts ipcMain.handle calls to the main frame of a real app window. */
function enableIpcSenderValidation(): void {
  setIpcSenderValidator((wc, event) => {
    if (wc.isDestroyed()) return false
    const frame = event.senderFrame
    if (!frame) return false
    const known = BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.webContents.id === wc.id)
    if (!known) return false
    return frame === wc.mainFrame
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    title: 'OPAC Library System',
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    if (!process.env.ELECTRON_RENDERER_URL && url === rendererUrl) return
    event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function broadcastToRenderer(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

let getConnectionOverride: (() => ConnectionConfig | null) | null = null

function registerImageProtocol(appMode: AppMode): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (appMode === 'user') {
        const config = getConnectionOverride?.() ?? null
        if (!config || !config.token) {
          return new Response('Not configured', { status: 503 })
        }
        const remoteUrl = `http://${config.host.trim().replace(/^https?:\/\//, '')}:${config.port}/api/v1/covers/${encodeURIComponent(filename)}`
        return net.fetch(remoteUrl, {
          headers: { Authorization: `Bearer ${config.token}` }
        })
      }
      const fullPath = resolveImagePath(getSystemDirs().imagesDir, filename)
      if (!existsSync(fullPath)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(fullPath).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

async function bootstrapAdmin(): Promise<void> {
  const dirs = getAppDirs()
  const systemDirs = getSystemDirs()
  ensureDirs(dirs)
  ensureSystemDirs(systemDirs)
  initLogger({ logsDir: systemDirs.logsDir })
  enableIpcSenderValidation()
  registerImageProtocol('admin')

  const makeProvisioner = provisioner(systemDirs, {
    onLog: (line: string) => logger.info(line)
  })

  const build = buildAdminServices(dirs, systemDirs, makeProvisioner, {
    broadcastSettings: () => {
      const settings = appServices?.settings
      if (!settings) return
      void settings.getAll().then((current) => {
        broadcastToRenderer(IPC.eventSettingsChanged, current)
      })
    },
    broadcastSession: () => {
      broadcastToRenderer(IPC.eventSessionChanged)
    }
  })

  const { services, db, repo } = await build()
  appServices = services
  adminDb = db

  // Opportunistic one-time migration from the legacy SQLite database.
  const legacySqlitePath = dirs.dbPath
  if (existsSync(legacySqlitePath)) {
    const report = await migrateSqliteFrom({
      db,
      repo,
      sqlitePath: legacySqlitePath,
      imagesDir: systemDirs.imagesDir
    })
    if (report.migrated) {
      logger.info('legacy SQLite data migrated', { counts: report.counts, warnings: report.warnings })
    }
  }

  registerAllIpc(services)
  finalizeBootstrap(dirs)
}

async function bootstrapUser(): Promise<void> {
  const dirs = getAppDirs()
  ensureDirs(dirs)
  initLogger({ logsDir: dirs.logsDir })
  enableIpcSenderValidation()
  registerImageProtocol('user')

  const { services, getConnection } = buildUserServices(dirs)
  getConnectionOverride = getConnection
  appServices = services
  registerAllIpc(services)
  finalizeBootstrap(dirs)
}

async function finalizeBootstrap(dirs: { userData: string }): Promise<void> {
  await session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['clipboard-sanitized-write', 'clipboard-read']
    callback(allowed.includes(permission))
  })
  createWindow()
  logger.info('application started', {
    version: app.getVersion(),
    mode: getAppMode(),
    userData: dirs.userData
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (adminDb) {
    adminDb.end().catch((err) => logger.warn('postgres pool close error', err))
    adminDb = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

const smokeFlagIndex = process.argv.indexOf('--smoke-test')
const smokeDirFlagIndex = process.argv.indexOf('--smoke-dir')

app.whenReady().then(async () => {
  if (smokeFlagIndex !== -1) {
    const dir = smokeDirFlagIndex !== -1 ? process.argv[smokeDirFlagIndex + 1] : '.smoke-tmp'
    try {
      const { runSmoke } = await import('./smoke')
      await runSmoke({ dir })
      app.exit(0)
    } catch (err) {
      console.error('[smoke] FAILED:', err)
      logger.error('smoke test failed', err)
      try {
        writeFileSync(
          join(process.cwd(), '.smoke-failure.txt'),
          `FAILED ${new Date().toISOString()}\n${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
        )
      } catch {
        // ignore diagnostics write failures
      }
      app.exit(1)
    }
    return
  }

  const mode = getAppMode()
  logger.info('boot mode', { mode })
  try {
    if (mode === 'admin') {
      await bootstrapAdmin()
    } else {
      await bootstrapUser()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('failed to start application', { message })
    dialog.showErrorBox('Unable to start', `${message}\n\nSee the log file for details.`)
    app.exit(1)
  }
})

process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', err)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', reason)
})