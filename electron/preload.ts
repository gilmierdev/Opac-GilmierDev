import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/api'
import type { LibraryApi } from '../shared/api'
import type {
  AdminUser,
  AuthorInput,
  BookFilters,
  BookInput,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  ChangePasswordInput,
  CreateAdminInput,
  ImportTaskInput,
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

let activePort = -1
let activeToken = ''

async function getAdminBaseUrl(): Promise<string> {
  if (activePort < 0) {
    const st = await invoke<{ apiPort: number }>(IPC.networkStatus)
    activePort = st.apiPort
  }
  return `http://127.0.0.1:${activePort}/api/v1/admin`
}

async function fetchAdmin<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getAdminBaseUrl()
  const headers = new Headers(options?.headers)
  if (activeToken) {
    headers.set('Authorization', `Bearer ${activeToken}`)
  }
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${base}${path}`, { ...options, headers })
  const json = await res.json() as any
  if (!json.ok) throw new Error(json.error || 'API Request failed')
  return json.data as T
}

async function fetchRpc<T>(service: string, method: string, ...args: any[]): Promise<T> {
  return fetchAdmin<T>('/rpc', {
    method: 'POST',
    body: JSON.stringify({ service, method, args })
  })
}

const api: LibraryApi = {
  paths: () => invoke('app:paths'),
  openPath: (path: string) => invoke('app:open-path', path),
  restart: () => {
    void ipcRenderer.invoke('app:restart')
  },
  installInfo: () => invoke(IPC.appInstallInfo),
  mode: () => invoke(IPC.appMode),

  connection: {
    get: () => invoke(IPC.connectionGet),
    save: (config) => invoke(IPC.connectionSave, config),
    test: (config) => invoke(IPC.connectionTest, config),
    reset: () => invoke(IPC.connectionReset)
  },

  network: {
    status: () => invoke(IPC.networkStatus),
    start: () => invoke(IPC.networkStart),
    stop: () => invoke(IPC.networkStop),
    restart: () => invoke(IPC.networkRestart),
    tokenInfo: () => invoke(IPC.networkTokenInfo),
    regenerateToken: () => invoke(IPC.networkRegenerateToken),
    setPort: (port: number) => invoke(IPC.networkSetPort, port),
    firewall: () => invoke(IPC.networkFirewall)
  },

  database: {
    status: () => fetchRpc('database', 'status'),
    clearCatalog: () => fetchRpc('database', 'clearCatalog')
  },

  auth: {
    needsSetup: () => fetchAdmin<boolean>('/auth/needs-setup'),
    setup: (input: CreateAdminInput) => fetchAdmin<AdminUser>('/auth/setup', {
      method: 'POST', body: JSON.stringify(input)
    }),
    login: async (username: string, password: string) => {
      const res = await fetchAdmin<{ user: AdminUser, token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      activeToken = res.token
      return res.user
    },
    logout: async () => {
      await fetchAdmin('/auth/logout', { method: 'POST' })
      activeToken = ''
    },
    session: () => fetchAdmin<AdminUser | null>('/auth/session'),
    changePassword: (input: ChangePasswordInput) => fetchRpc('auth', 'changePassword', input.currentPassword, input.newPassword),
    recoverPassword: (input: { pin: string; newPassword: string; username?: string }) => fetchRpc('auth', 'recoverPassword', input.pin, input.newPassword, input.username)
  },

  books: {
    list: async (filters: BookFilters) => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksList, filters)
      return fetchRpc('books', 'list', filters)
    },
    get: async (id: number) => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksGet, id)
      return fetchRpc('books', 'get', id)
    },
    create: (input: BookInput) => fetchRpc('books', 'create', input),
    update: (id: number, input: BookInput) => fetchRpc('books', 'update', id, input),
    archive: (id: number) => fetchRpc('books', 'archive', id),
    restore: (id: number) => fetchRpc('books', 'restore', id),
    delete: (id: number) => fetchRpc('books', 'delete', id),
    stats: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksStats)
      return fetchRpc('books', 'stats')
    },
    importParse: (input: Omit<ImportTaskInput, 'columnMap' | 'options'>) => fetchRpc('books', 'importParse', input),
    importRun: (input: ImportTaskInput) => fetchRpc('books', 'importRun', input)
  },

  authors: {
    list: () => fetchRpc('authors', 'list'),
    create: (input: AuthorInput) => fetchRpc('authors', 'create', input),
    update: (id: number, input: AuthorInput) => fetchRpc('authors', 'update', id, input),
    archive: (id: number) => fetchRpc('authors', 'archive', id)
  },

  categories: {
    list: () => fetchRpc('categories', 'list'),
    create: (input: CategoryInput) => fetchRpc('categories', 'create', input),
    update: (id: number, input: CategoryInput) => fetchRpc('categories', 'update', id, input),
    archive: (id: number) => fetchRpc('categories', 'archive', id)
  },

  publishers: {
    list: () => fetchRpc('publishers', 'list'),
    create: (input: PublisherInput) => fetchRpc('publishers', 'create', input),
    update: (id: number, input: PublisherInput) => fetchRpc('publishers', 'update', id, input),
    archive: (id: number) => fetchRpc('publishers', 'archive', id)
  },

  borrowings: {
    list: (filters: BorrowingFilters) => fetchRpc('borrowings', 'list', filters),
    create: (input: BorrowingInput) => fetchRpc('borrowings', 'create', input),
    return: (id: number) => fetchRpc('borrowings', 'return', id)
  },

  images: {
    pickCover: () => fetchRpc('images', 'pickCover'),
    pickLogo: () => fetchRpc('images', 'pickLogo'),
    delete: (filename: string) => fetchRpc('images', 'delete', filename)
  },

  backup: {
    create: () => fetchRpc('backup', 'create'),
    list: () => fetchRpc('backup', 'list'),
    restore: (filename: string) => fetchRpc('backup', 'restore', filename),
    pickAndRestore: () => fetchRpc('backup', 'pickAndRestore')
  },

  settings: {
    getAll: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.settingsGetAll)
      return fetchRpc('settings', 'getAll')
    },
    set: (key: any, value: any) => fetchRpc('settings', 'set', key, value)
  },

  onSettingsChanged: (cb: (settings: SettingsMap) => void) =>
    subscribe<SettingsMap>(IPC.eventSettingsChanged, cb),
  onSessionChanged: (cb: () => void) =>
    subscribe<unknown>(IPC.eventSessionChanged, () => cb())
}

contextBridge.exposeInMainWorld('api', api)