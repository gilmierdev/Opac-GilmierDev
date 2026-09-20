import type {
  AdminUser,
  AppPaths,
  AsyncResult,
  AuthorInput,
  AuthorListItem,
  BackupFile,
  Book,
  BookFilters,
  BookInput,
  Borrowing,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  CategoryListItem,
  ChangePasswordInput,
  CreateAdminInput,
  DashboardStats,
  ImageResult,
  Paginated,
  PublisherInput,
  PublisherListItem,
  SettingsMap
} from './types'

export const IPC = {
  appPaths: 'app:paths',
  appOpenPath: 'app:open-path',
  appRestart: 'app:restart',

  authNeedsSetup: 'auth:needs-setup',
  authSetup: 'auth:setup',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authChangePassword: 'auth:change-password',

  booksList: 'books:list',
  booksGet: 'books:get',
  booksCreate: 'books:create',
  booksUpdate: 'books:update',
  booksArchive: 'books:archive',
  booksRestore: 'books:restore',
  booksStats: 'books:stats',

  authorsList: 'authors:list',
  authorsCreate: 'authors:create',
  authorsUpdate: 'authors:update',
  authorsArchive: 'authors:archive',

  categoriesList: 'categories:list',
  categoriesCreate: 'categories:create',
  categoriesUpdate: 'categories:update',
  categoriesArchive: 'categories:archive',

  publishersList: 'publishers:list',
  publishersCreate: 'publishers:create',
  publishersUpdate: 'publishers:update',
  publishersArchive: 'publishers:archive',

  borrowingsList: 'borrowings:list',
  borrowingsCreate: 'borrowings:create',
  borrowingsReturn: 'borrowings:return',

  imagesPickCover: 'images:pick-cover',
  imagesPickLogo: 'images:pick-logo',
  imagesDelete: 'images:delete',

  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  backupPickAndRestore: 'backup:pick-restore',

  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',

  eventSettingsChanged: 'settings:changed',
  eventSessionChanged: 'session:changed'
} as const

export interface LibraryApi {
  paths(): Promise<AppPaths>
  openPath(path: string): Promise<void>
  restart(): void

  auth: {
    needsSetup(): Promise<boolean>
    setup(input: CreateAdminInput): Promise<AdminUser>
    login(username: string, password: string): Promise<AdminUser>
    logout(): Promise<void>
    session(): Promise<AdminUser | null>
    changePassword(input: ChangePasswordInput): Promise<void>
  }

  books: {
    list(filters: BookFilters): Promise<Paginated<Book>>
    get(id: number): Promise<Book | null>
    create(input: BookInput): Promise<Book>
    update(id: number, input: BookInput): Promise<Book>
    archive(id: number): Promise<Book>
    restore(id: number): Promise<Book>
    stats(): Promise<DashboardStats>
  }

  authors: {
    list(): Promise<AuthorListItem[]>
    create(input: AuthorInput): Promise<AuthorListItem>
    update(id: number, input: AuthorInput): Promise<AuthorListItem>
    archive(id: number): Promise<AuthorListItem>
  }

  categories: {
    list(): Promise<CategoryListItem[]>
    create(input: CategoryInput): Promise<CategoryListItem>
    update(id: number, input: CategoryInput): Promise<CategoryListItem>
    archive(id: number): Promise<CategoryListItem>
  }

  publishers: {
    list(): Promise<PublisherListItem[]>
    create(input: PublisherInput): Promise<PublisherListItem>
    update(id: number, input: PublisherInput): Promise<PublisherListItem>
    archive(id: number): Promise<PublisherListItem>
  }

  borrowings: {
    list(filters: BorrowingFilters): Promise<Paginated<Borrowing>>
    create(input: BorrowingInput): Promise<Borrowing>
    return(id: number): Promise<Borrowing>
  }

  images: {
    pickCover(): Promise<ImageResult>
    pickLogo(): Promise<ImageResult>
    delete(filename: string): Promise<void>
  }

  backup: {
    create(): Promise<BackupFile>
    list(): Promise<BackupFile[]>
    restore(filename: string): Promise<void>
    pickAndRestore(): Promise<AsyncResult<string>>
  }

  settings: {
    getAll(): Promise<SettingsMap>
    set(key: keyof SettingsMap, value: string | null): Promise<void>
  }

  onSettingsChanged(cb: (settings: SettingsMap) => void): () => void
  onSessionChanged(cb: () => void): () => void
}