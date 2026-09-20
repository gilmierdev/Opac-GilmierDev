import { registerAuthIpc } from './auth.ipc'
import { registerBooksIpc } from './books.ipc'
import { registerAuthorsIpc } from './authors.ipc'
import { registerCategoriesIpc } from './categories.ipc'
import { registerPublishersIpc } from './publishers.ipc'
import { registerBorrowingsIpc } from './borrowings.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerImagesIpc } from './images.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerAppIpc } from './app.ipc'
import type { Services } from './types'

export function registerAllIpc(services: Services): void {
  registerAppIpc(services)
  registerAuthIpc(services)
  registerBooksIpc(services)
  registerAuthorsIpc(services)
  registerCategoriesIpc(services)
  registerPublishersIpc(services)
  registerBorrowingsIpc(services)
  registerBackupIpc(services)
  registerImagesIpc(services)
  registerSettingsIpc(services)
}