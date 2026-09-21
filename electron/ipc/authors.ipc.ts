import { IPC } from '@shared/api'
import type { AuthorInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

function validateNameInput<T extends { name?: unknown }>(input: T): asserts input is T & { name: string } {
  if (!input || typeof input !== 'object' || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Name is required')
  }
}

export function registerAuthorsIpc({ authors, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(authors, 'Authors')

  registerIpc(IPC.authorsList, () => svc.list(), { context: ctx })
  registerIpc(IPC.authorsCreate, (input: AuthorInput) => {
    validateNameInput(input)
    return svc.create(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.authorsUpdate, (id: number, input: AuthorInput) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid author id')
    validateNameInput(input)
    return svc.update(id, input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.authorsArchive, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid author id')
    return svc.archive(id)
  }, { context: ctx, requireAuth: true })
}