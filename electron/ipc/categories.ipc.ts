import { IPC } from '@shared/api'
import type { CategoryInput } from '@shared/types'
import { registerIpc } from './register'
import { categoriesRepository } from '../database/repositories/categories.repository'
import type { Services } from './types'

export function registerCategoriesIpc({ getDb, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.categoriesList, () => categoriesRepository(getDb()).list(), { context: ctx })
  registerIpc(
    IPC.categoriesCreate,
    (input: CategoryInput) => {
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return categoriesRepository(getDb()).create(input)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.categoriesUpdate,
    (id: number, input: CategoryInput) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid category id')
      if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Name is required')
      }
      return categoriesRepository(getDb()).update(id, input)
    },
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.categoriesArchive,
    (id: number) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid category id')
      return categoriesRepository(getDb()).archive(id)
    },
    { context: ctx, requireAuth: true }
  )
}