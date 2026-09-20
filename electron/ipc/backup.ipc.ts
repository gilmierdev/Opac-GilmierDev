import { IPC } from '@shared/api'
import { registerIpc } from './register'
import type { Services } from './types'

export function registerBackupIpc({ backup, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.backupCreate, () => backup.create(), { context: ctx, requireAuth: true })
  registerIpc(IPC.backupList, () => backup.list(), { context: ctx, requireAuth: true })
  registerIpc(
    IPC.backupRestore,
    (filename: string) => {
      if (typeof filename !== 'string' || !filename) throw new Error('Invalid backup filename')
      return backup.restoreFromFile(filename)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.backupPickAndRestore,
    () => backup.pickAndRestore(),
    { context: ctx, requireAuth: true }
  )
}