import type { Db } from '../client'
import { usersRepository, type UsersRepository } from './users.repository'
import { settingsRepository, type SettingsRepository } from './settings.repository'
import { authorsRepository, type AuthorsRepository } from './authors.repository'
import { categoriesRepository, type CategoriesRepository } from './categories.repository'
import { publishersRepository, type PublishersRepository } from './publishers.repository'
import { booksRepository, type BooksRepository } from './books.repository'
import { borrowingsRepository, type BorrowingsRepository } from './borrowings.repository'

export interface Repositories {
  users: UsersRepository
  settings: SettingsRepository
  authors: AuthorsRepository
  categories: CategoriesRepository
  publishers: PublishersRepository
  books: BooksRepository
  borrowings: BorrowingsRepository
}

export function repositories(db: Db): Repositories {
  return {
    users: usersRepository(db),
    settings: settingsRepository(db),
    authors: authorsRepository(db),
    categories: categoriesRepository(db),
    publishers: publishersRepository(db),
    books: booksRepository(db),
    borrowings: borrowingsRepository(db)
  }
}

export type {
  UsersRepository,
  SettingsRepository,
  AuthorsRepository,
  CategoriesRepository,
  PublishersRepository,
  BooksRepository,
  BorrowingsRepository
}