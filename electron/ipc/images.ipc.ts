import { IPC } from '@shared/api'
import { registerIpc } from './register'
import type { Services } from './types'

export function registerImagesIpc({ images, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(
    IPC.imagesPickCover,
    () => images.pickAndSave(),
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.imagesPickLogo,
    () => images.pickAndSave(),
    { context: ctx, requireAuth: true }
  )
  registerIpc(
    IPC.imagesDelete,
    (filename: string) => {
      if (typeof filename !== 'string' || !filename) throw new Error('Invalid image filename')
      return images.delete(filename)
    },
    { context: ctx, requireAuth: true }
  )
}