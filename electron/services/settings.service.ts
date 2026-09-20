import type { DB } from '../database/connection'
import { settingsRepository } from '../database/repositories/settings.repository'
import type { SettingsMap } from '@shared/types'
import { logger } from '../utils/logger'

const DEFAULTS: SettingsMap = {
  library_name: 'OPAC Library',
  library_logo: null,
  library_address: '',
  contact_info: '',
  theme: 'light'
}

export const SETTING_KEYS = Object.keys(DEFAULTS) as Array<keyof SettingsMap>

export interface SettingsService {
  getAll(): SettingsMap
  get<K extends keyof SettingsMap>(key: K): SettingsMap[K]
  set(key: keyof SettingsMap, value: string | null): void
}

export function settingsService(getDb: () => DB): SettingsService {
  return {
    getAll(): SettingsMap {
      const db = getDb()
      const repo = settingsRepository(db)
      const all = repo.getAll()
      const result = { ...DEFAULTS }
      for (const key of SETTING_KEYS) {
        if (key in all) {
          const v = all[key]
          if (key === 'theme') {
            result[key] = (v === 'dark' ? 'dark' : 'light') as SettingsMap['theme']
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(result as any)[key] = v
          }
        }
      }
      return result
    },
    get(key) {
      return this.getAll()[key]
    },
    set(key, value) {
      const db = getDb()
      settingsRepository(db).set(key, value)
      logger.info('setting updated', { key })
    }
  }
}