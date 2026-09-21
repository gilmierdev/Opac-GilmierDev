import { IPC } from '@shared/api'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerBackupIpc({ backup, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(backup, 'Backups')

  registerIpc(IPC.backupCreate, () => svc.create(), { context: ctx, requireAuth: true })
  registerIpc(IPC.backupList, () => svc.list(), { context: ctx, requireAuth: true })
  registerIpc(IPC.backupRestore, (filename: string) => {
    if (typeof filename !== 'string' || !filename) throw new Error('Invalid backup filename')
    return svc.restore(filename)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.backupPickAndRestore, () => svc.pickAndRestore(), { context: ctx, requireAuth: true })
}