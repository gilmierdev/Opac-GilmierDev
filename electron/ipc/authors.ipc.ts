import { IPC } from '@shared/api'
import type { AuthorInput } from '@shared/types'
import { registerIpc } from './register'
import { authorsRepository } from '../database/repositories/authors.repository'
import type { Services } from './types'

export function registerAuthorsIpc({ getDb, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  const require = (fn: () => unknown) => {
    try {
      return fn()
    } catch (err) {
      throw err
    }
  }

  registerIpc(IPC.authorsList, () => authorsRepository(getDb()).list(), { context: ctx })
  registerIpc(
    IPC.authorsCreate,
    (input: AuthorInput) => {
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return require(() => authorsRepository(getDb()).create(input))
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.authorsUpdate,
    (id: number, input: AuthorInput) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid author id')
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return require(() => authorsRepository(getDb()).update(id, input))
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.authorsArchive,
    (id: number) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid author id')
      return require(() => authorsRepository(getDb()).archive(id))
    },
    { context: ctx, requireAuth: true }
  )
}