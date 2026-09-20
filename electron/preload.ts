import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/api'
import type { LibraryApi } from '../shared/api'
import type {
  AdminUser,
  AuthorInput,
  BackupFile,
  BookFilters,
  BookInput,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  ChangePasswordInput,
  CreateAdminInput,
  PublisherInput,
  SettingsMap
} from '../shared/types'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).then((result) => {
    if (result && typeof result === 'object' && 'ok' in result) {
      const envelope = result as { ok: boolean; data?: T; error?: string }
      if (!envelope.ok) {
        const error = new Error(envelope.error ?? 'An unexpected error occurred')
        error.name = 'OpacError'
        throw error
      }
      return envelope.data as T
    }
    return result as T
  })
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LibraryApi = {
  paths: () => invoke('app:paths'),
  openPath: (path: string) => invoke('app:open-path', path),
  restart: () => {
    void ipcRenderer.invoke('app:restart')
  },

  auth: {
    needsSetup: () => invoke<boolean>(IPC.authNeedsSetup),
    setup: (input: CreateAdminInput) => invoke<AdminUser>(IPC.authSetup, input),
    login: (username: string, password: string) => invoke<AdminUser>(IPC.authLogin, username, password),
    logout: () => invoke<void>(IPC.authLogout),
    session: () => invoke<AdminUser | null>(IPC.authSession),
    changePassword: (input: ChangePasswordInput) => invoke<void>(IPC.authChangePassword, input)
  },

  books: {
    list: (filters: BookFilters) => invoke(IPC.booksList, filters),
    get: (id: number) => invoke(IPC.booksGet, id),
    create: (input: BookInput) => invoke(IPC.booksCreate, input),
    update: (id: number, input: BookInput) => invoke(IPC.booksUpdate, id, input),
    archive: (id: number) => invoke(IPC.booksArchive, id),
    restore: (id: number) => invoke(IPC.booksRestore, id),
    stats: () => invoke(IPC.booksStats)
  },

  authors: {
    list: () => invoke(IPC.authorsList),
    create: (input: AuthorInput) => invoke(IPC.authorsCreate, input),
    update: (id: number, input: AuthorInput) => invoke(IPC.authorsUpdate, id, input),
    archive: (id: number) => invoke(IPC.authorsArchive, id)
  },

  categories: {
    list: () => invoke(IPC.categoriesList),
    create: (input: CategoryInput) => invoke(IPC.categoriesCreate, input),
    update: (id: number, input: CategoryInput) => invoke(IPC.categoriesUpdate, id, input),
    archive: (id: number) => invoke(IPC.categoriesArchive, id)
  },

  publishers: {
    list: () => invoke(IPC.publishersList),
    create: (input: PublisherInput) => invoke(IPC.publishersCreate, input),
    update: (id: number, input: PublisherInput) => invoke(IPC.publishersUpdate, id, input),
    archive: (id: number) => invoke(IPC.publishersArchive, id)
  },

  borrowings: {
    list: (filters: BorrowingFilters) => invoke(IPC.borrowingsList, filters),
    create: (input: BorrowingInput) => invoke(IPC.borrowingsCreate, input),
    return: (id: number) => invoke(IPC.borrowingsReturn, id)
  },

  images: {
    pickCover: () => invoke(IPC.imagesPickCover),
    pickLogo: () => invoke(IPC.imagesPickLogo),
    delete: (filename: string) => invoke(IPC.imagesDelete, filename)
  },

  backup: {
    create: () => invoke<BackupFile>(IPC.backupCreate),
    list: () => invoke<BackupFile[]>(IPC.backupList),
    restore: (filename: string) => invoke<void>(IPC.backupRestore, filename),
    pickAndRestore: () => invoke(IPC.backupPickAndRestore)
  },

  settings: {
    getAll: () => invoke(IPC.settingsGetAll),
    set: (key, value) => invoke(IPC.settingsSet, key, value)
  },

  onSettingsChanged: (cb: (settings: SettingsMap) => void) =>
    subscribe<SettingsMap>(IPC.eventSettingsChanged, cb),
  onSessionChanged: (cb: () => void) =>
    subscribe<unknown>(IPC.eventSessionChanged, () => cb())
}

contextBridge.exposeInMainWorld('api', api)