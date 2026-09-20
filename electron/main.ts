import { app, BrowserWindow, protocol, net, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { getAppDirs, ensureDirs, resolveImagePath } from './config/paths'
import { initLogger, logger } from './utils/logger'
import { openDatabase, getDatabase, getDatabasePath, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { seedDatabase } from './database/seed'
import { authService } from './services/auth.service'
import { settingsService } from './services/settings.service'
import { bookImageService } from './services/book-image.service'
import { backupService } from './services/backup.service'
import { registerAllIpc } from './ipc'
import { openFolderPath, restartApp } from './utils/system'
import type { AppDirs } from './config/paths'
import { IPC } from '../shared/api'

const IMAGE_SCHEME = 'opac-img'

registerPrivilegedSchemes()

function registerPrivilegedSchemes(): void {
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
}

let mainWindow: BrowserWindow | null = null

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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL
    if (allowed && url.startsWith(allowed)) return
    if (!allowed && url.startsWith('file:')) return
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

function buildServices() {
  const dirs = getAppDirs()
  const auth = authService(getDatabase)
  const settings = settingsService(getDatabase)
  const images = bookImageService(dirs)

  const broadcastSettings = (): void => {
    const current = settingsService(getDatabase).getAll()
    broadcastToRenderer(IPC.eventSettingsChanged, current)
  }
  const broadcastSession = (): void => {
    broadcastToRenderer(IPC.eventSessionChanged)
  }
  const reloadDatabaseAfterRestore = (): void => {
    closeDatabase()
    const db = openDatabase(dirs.dbPath)
    runMigrations(db)
    seedDatabase(db, { imagesDir: dirs.imagesDir, isDev: !app.isPackaged })
    auth.logout()
    broadcastSettings()
    broadcastSession()
    logger.info('database connection reloaded after restore')
  }

  const backup = backupService(
    dirs,
    () => getDatabasePath(),
    () => {
      try {
        getDatabase().pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        // ignore
      }
    },
    reloadDatabaseAfterRestore
  )
  return {
    dirs,
    getDb: getDatabase,
    auth,
    settings,
    images,
    backup,
    openPath: openFolderPath,
    restart: restartApp,
    isAuthenticated: () => auth.getSession() !== null,
    broadcastSettings,
    broadcastSession
  }
}

function registerImageProtocol(dirs: AppDirs): void {
  protocol.handle(IMAGE_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const fullPath = resolveImagePath(dirs, filename)
      if (!existsSync(fullPath)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(fullPath).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

async function bootstrap(app: Electron.App): Promise<void> {
  try {
    const dirs = getAppDirs()
    ensureDirs(dirs)
    initLogger(dirs)
    registerImageProtocol(dirs)

    const db = openDatabase(dirs.dbPath)
    runMigrations(db)
    seedDatabase(db, { imagesDir: dirs.imagesDir, isDev: !app.isPackaged })

    const services = buildServices()
    registerAllIpc(services)

    await session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const allowed = ['clipboard-sanitized-write', 'clipboard-read']
      callback(allowed.includes(permission))
    })

    createWindow()
    logger.info('application started', { version: app.getVersion(), userData: dirs.userData })
  } catch (err) {
    logger.error('failed to bootstrap application', err)
    app.quit()
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  try {
    closeDatabase()
  } catch {
    // ignore
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
        const { writeFileSync } = await import('node:fs')
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
  bootstrap(app)
})

process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', err)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', reason)
})