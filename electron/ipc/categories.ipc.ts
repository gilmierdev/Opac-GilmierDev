import { IPC } from '@shared/api'
import type { CategoryInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

function validateNameInput<T extends { name?: unknown }>(input: T): asserts input is T & { name: string } {
  if (!input || typeof input !== 'object' || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Name is required')
  }
}

export function registerCategoriesIpc({ categories, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(categories, 'Categories')

  registerIpc(IPC.categoriesList, () => svc.list(), { context: ctx })
  registerIpc(IPC.categoriesCreate, (input: CategoryInput) => {
    validateNameInput(input)
    return svc.create(input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.categoriesUpdate, (id: number, input: CategoryInput) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid category id')
    validateNameInput(input)
    return svc.update(id, input)
  }, { context: ctx, requireAuth: true })
  registerIpc(IPC.categoriesArchive, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid category id')
    return svc.archive(id)
  }, { context: ctx, requireAuth: true })
}