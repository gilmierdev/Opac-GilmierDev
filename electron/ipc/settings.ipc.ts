import { IPC } from '@shared/api'
import type { SettingsMap } from '@shared/types'
import { registerIpc } from './register'
import { SETTING_KEYS } from '../services/settings.service'
import type { Services } from './types'

export function registerSettingsIpc({ settings, isAuthenticated, broadcastSettings }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.settingsGetAll, () => settings.getAll(), { context: ctx })
  registerIpc(IPC.settingsSet, (key: keyof SettingsMap, value: string | null) => {
    if (!SETTING_KEYS.includes(key)) throw new Error('Invalid setting key')
    if (value != null && typeof value !== 'string') throw new Error('Invalid setting value')
    return settings.set(key, value).then(() => {
      broadcastSettings()
    })
  }, { context: ctx, requireAuth: true })
}