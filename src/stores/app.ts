import { create } from 'zustand'
import type { AdminUser, SettingsMap, AppPaths } from '@shared/types'

interface AppState {
  user: AdminUser | null
  settings: SettingsMap
  paths: AppPaths | null
  ready: boolean
  initialized: boolean
  setUser: (user: AdminUser | null) => void
  setSettings: (settings: SettingsMap) => void
  setPaths: (paths: AppPaths) => void
  setReady: (ready: boolean) => void
  setInitialized: (value: boolean) => void
}

const DEFAULT_SETTINGS: SettingsMap = {
  library_name: 'OPAC Library',
  library_logo: null,
  library_address: '',
  contact_info: '',
  theme: 'light'
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  settings: DEFAULT_SETTINGS,
  paths: null,
  ready: false,
  initialized: false,
  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings }),
  setPaths: (paths) => set({ paths }),
  setReady: (ready) => set({ ready }),
  setInitialized: (value) => set({ initialized: value })
}))

export function applyTheme(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export async function bootstrapApp(): Promise<void> {
  const store = useAppStore.getState()
  try {
    const paths = await window.api.paths()
    store.setPaths(paths)
    const session = await window.api.auth.session()
    store.setUser(session)
    const settings = await window.api.settings.getAll()
    store.setSettings(settings)
    applyTheme(settings.theme)

    window.api.onSessionChanged(() => {
      void (async () => {
        const s = await window.api.auth.session()
        useAppStore.getState().setUser(s)
      })()
    })
    window.api.onSettingsChanged((next) => {
      if (next) {
        useAppStore.getState().setSettings(next)
        applyTheme(next.theme ?? 'light')
      }
    })
    store.setInitialized(true)
  } finally {
    store.setReady(true)
  }
}