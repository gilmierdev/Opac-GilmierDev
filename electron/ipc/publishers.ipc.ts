import { IPC } from '@shared/api'
import type { PublisherInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

function validateNameInput<T extends { name?: unknown }>(input: T): asserts input is T & { name: string } {
  if (!input || typeof input !== 'object' || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Name is required')
  }
}

export function registerPublishersIpc({ publishers, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(publishers, 'Publishers')

  registerIpc(IPC.publishersList, () => svc.list(), { context: ctx })
  registerIpc(IPC.publishersCreate, (input: PublisherInput) => {
    validateNameInput(input)
    return svc.create(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.publishersUpdate, (id: number, input: PublisherInput) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid publisher id')
    validateNameInput(input)
    return svc.update(id, input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.publishersArchive, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid publisher id')
    return svc.archive(id)
  }, { context: ctx, requireAuth: true })
}