import { ipcMain } from 'electron'
import { logger } from '../utils/logger'

export interface IpcContext {
  isAuthenticated: () => Promise<boolean>
}

type Handler<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult | Promise<TResult>

/**
 * Wraps an ipcMain.handle registration with:
 * - consistent { ok, data | error } envelope
 * - optional authentication requirement
 * - safe structured logging (never logs secrets)
 */
export function registerIpc<TArgs extends unknown[], TResult>(
  channel: string,
  handler: Handler<TArgs, TResult>,
  options?: { requireAuth?: boolean; context?: IpcContext }
): void {
  const { requireAuth = false, context } = options ?? {}
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      if (requireAuth && context) {
        const authed = await context.isAuthenticated()
        if (!authed) {
          return { ok: false, error: 'Not authenticated. Please sign in again.' }
        }
      }
      const data = await handler(...(args as TArgs))
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      logger.warn(`ipc:${channel} failed`, { message: message.slice(0, 300) })
      return { ok: false, error: message }
    }
  })
}

/** Extract the channel name from the IPC map for clarity in errors. */
export function channel(name: string): string {
  return name
}