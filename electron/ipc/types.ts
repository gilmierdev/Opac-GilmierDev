import type { DB } from '../database/connection'
import type { AppDirs } from '../config/paths'
import type { AuthService } from '../services/auth.service'
import type { SettingsService } from '../services/settings.service'
import type { BookImageService } from '../services/book-image.service'
import type { BackupService } from '../services/backup.service'
import type { BooksRepository } from '../database/repositories/books.repository'
import type { AuthorsRepository } from '../database/repositories/authors.repository'
import type { CategoriesRepository } from '../database/repositories/categories.repository'
import type { PublishersRepository } from '../database/repositories/publishers.repository'
import type { UsersRepository } from '../database/repositories/users.repository'
import type { BorrowingsRepository } from '../database/repositories/borrowings.repository'

export interface Services {
  dirs: AppDirs
  getDb: () => DB
  auth: AuthService
  settings: SettingsService
  images: BookImageService
  backup: BackupService
  isAuthenticated: () => boolean
  openPath: (path: string) => Promise<void>
  restart: () => void
  broadcastSettings: () => void
  broadcastSession: () => void
}

export type {
  BooksRepository,
  AuthorsRepository,
  CategoriesRepository,
  PublishersRepository,
  UsersRepository,
  BorrowingsRepository
}