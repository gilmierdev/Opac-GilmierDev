import { IPC } from '@shared/api'
import type { PublisherInput } from '@shared/types'
import { registerIpc } from './register'
import { publishersRepository } from '../database/repositories/publishers.repository'
import type { Services } from './types'

export function registerPublishersIpc({ getDb, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.publishersList, () => publishersRepository(getDb()).list(), { context: ctx })
  registerIpc(
    IPC.publishersCreate,
    (input: PublisherInput) => {
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return publishersRepository(getDb()).create(input)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.publishersUpdate,
    (id: number, input: PublisherInput) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid publisher id')
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return publishersRepository(getDb()).update(id, input)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.publishersArchive,
    (id: number) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid publisher id')
      return publishersRepository(getDb()).archive(id)
    },
    { context: ctx, requireAuth: true }
  )
}