import { IPC } from '@shared/api'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerImagesIpc({ images, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(images, 'Image management')

  registerIpc(IPC.imagesPickCover, () => svc.pickCover(), { context: ctx, requireAuth: true })
  registerIpc(IPC.imagesPickLogo, () => svc.pickLogo(), { context: ctx, requireAuth: true })
  registerIpc(IPC.imagesDelete, (filename: string) => {
    if (typeof filename !== 'string' || !filename) throw new Error('Invalid image filename')
    return svc.delete(filename)
  }, { context: ctx, requireAuth: true })
}