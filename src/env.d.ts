import type { LibraryApi } from '../shared/api'

declare global {
  interface Window {
    api: LibraryApi
  }
}

export {}