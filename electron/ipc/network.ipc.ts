import { IPC } from '@shared/api'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerNetworkIpc({ network, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(network, 'The network server')

  registerIpc(IPC.networkStatus, () => svc.status(), { context: ctx, requireAuth: true })
  registerIpc(IPC.networkStart, () => svc.start(), { context: ctx, requireAuth: true })
  registerIpc(IPC.networkStop, () => svc.stop(), { context: ctx, requireAuth: true })
  registerIpc(IPC.networkRestart, () => svc.restart(), { context: ctx, requireAuth: true })
  registerIpc(IPC.networkTokenInfo, () => svc.tokenInfo(), { context: ctx, requireAuth: true })
  registerIpc(IPC.networkRegenerateToken, () => svc.regenerateToken(), { context: ctx, requireAuth: true })
  registerIpc(
    IPC.networkSetPort,
    (port: number) => {
      if (!Number.isInteger(port)) throw new Error('Invalid port')
      return svc.setPort(port)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(IPC.networkFirewall, () => svc.firewall(), { context: ctx, requireAuth: true })
}