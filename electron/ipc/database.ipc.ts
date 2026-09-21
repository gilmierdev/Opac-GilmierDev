import { IPC } from '@shared/api'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerDatabaseIpc({ database, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.databaseStatus, () => requireService(database, 'Database status').status(), {
    context: ctx
  })
}