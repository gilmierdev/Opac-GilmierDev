import { IPC } from '@shared/api'
import type { CreateAdminInput, ChangePasswordInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerAuthIpc({ auth, isAuthenticated, broadcastSession }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(auth, 'Authentication')

  registerIpc(IPC.authNeedsSetup, () => svc.needsSetup(), { context: ctx })
  registerIpc(
    IPC.authSetup,
    (input: CreateAdminInput) => {
      validateCreate(input)
      return svc.setup(input).then((user) => {
        void broadcastSession()
        return user
      })
    },
    { context: ctx }
  )
  registerIpc(
    IPC.authLogin,
    (username: string, password: string) => {
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        throw new Error('Username and password are required')
      }
      return svc.login(username, password).then((user) => {
        void broadcastSession()
        return user
      })
    },
    { context: ctx }
  )
  registerIpc(
    IPC.authLogout,
    () =>
      svc.logout().then(() => {
        void broadcastSession()
      }),
    { context: ctx, requireAuth: true }
  )
  registerIpc(IPC.authSession, () => svc.getSession(), { context: ctx })
  registerIpc(
    IPC.authChangePassword,
    (input: ChangePasswordInput) => {
      if (!input || typeof input !== 'object') throw new Error('Invalid request')
      if (typeof input.currentPassword !== 'string' || typeof input.newPassword !== 'string') {
        throw new Error('Invalid request')
      }
      return svc.changePassword(input.currentPassword, input.newPassword)
    },
    { context: ctx, requireAuth: true }
  )
}

function validateCreate(input: CreateAdminInput): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid request')
  if (typeof input.username !== 'string' || typeof input.password !== 'string') {
    throw new Error('Invalid request')
  }
  if (!input.username.trim()) throw new Error('Username is required')
  if (!input.password) throw new Error('Password is required')
}