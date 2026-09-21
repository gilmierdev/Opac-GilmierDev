import { app } from 'electron'
import { IPC } from '@shared/api'
import type { AppMode, AppPaths } from '@shared/types'
import { registerIpc } from './register'
import type { Services } from './types'

export function registerAppIpc({ dirs, installInfo, mode, openPath, restart, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(
    IPC.appPaths,
    (): AppPaths => ({
      userData: dirs.userData,
      dataDir: dirs.dataDir,
      dbPath: dirs.dbPath,
      imagesDir: dirs.imagesDir,
      backupsDir: dirs.backupsDir,
      logsDir: dirs.logsDir,
      isPackaged: app.isPackaged,
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
      }
    }),
    { context: ctx }
  )
  registerIpc(IPC.appInstallInfo, () => installInfo(), { context: ctx })
  registerIpc(IPC.appMode, (): Promise<AppMode> => mode(), { context: ctx })
  registerIpc(
    IPC.appOpenPath,
    (path: string) => {
      if (typeof path !== 'string' || !path) throw new Error('Invalid path')
      return openPath(path)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.appRestart,
    () => {
      restart()
    },
    { context: ctx, requireAuth: true }
  )
}