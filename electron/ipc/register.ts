import { ipcMain, type WebContents, type IpcMainInvokeEvent } from 'electron'
import { logger } from '../utils/logger'

export interface IpcContext {
  isAuthenticated: () => Promise<boolean>
}

type Handler<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult | Promise<TResult>

/**
 * Optional validator installed by the main process before IPC registration.
 * Returns false when the sender frame is not a trusted, top-level app frame.
 */
let senderValidator: ((wc: WebContents, event: IpcMainInvokeEvent) => boolean) | null = null

export function setIpcSenderValidator(validator: (wc: WebContents, event: IpcMainInvokeEvent) => boolean): void {
  senderValidator = validator
}

/**
 * Wraps an ipcMain.handle registration with:
 * - consistent { ok, data | error } envelope
 * - optional authentication requirement
 * - sender origin validation (defense-in-depth on top of contextIsolation)
 * - safe structured logging (never logs secrets)
 */
export function registerIpc<TArgs extends unknown[], TResult>(
  channel: string,
  handler: Handler<TArgs, TResult>,
  options?: { requireAuth?: boolean; context?: IpcContext }
): void {
  const { requireAuth = false, context } = options ?? {}
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (senderValidator && !senderValidator(event.sender, event)) {
        logger.warn(`ipc:${channel} rejected by sender validation`)
        throw new Error('Not authenticated. Please sign in again.')
      }
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