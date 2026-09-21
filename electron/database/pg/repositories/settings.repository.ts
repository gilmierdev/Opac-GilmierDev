import type { Db } from '../client'

export interface SettingsRepository {
  get(key: string): Promise<string | null>
  getAll(): Promise<Record<string, string>>
  set(key: string, value: string | null): Promise<void>
  setMany(entries: Array<[string, string | null]>): Promise<void>
}

export function settingsRepository(db: Db): SettingsRepository {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.one<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key])
      return row?.value ?? null
    },
    async getAll(): Promise<Record<string, string>> {
      const rows = await db.many<{ key: string; value: string }>('SELECT key, value FROM settings')
      const out: Record<string, string> = {}
      for (const row of rows) out[row.key] = row.value
      return out
    },
    async set(key: string, value: string | null): Promise<void> {
      if (value === null) {
        await db.query('DELETE FROM settings WHERE key = $1', [key])
      } else {
        await db.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [key, value]
        )
      }
    },
    async setMany(entries: Array<[string, string | null]>): Promise<void> {
      await db.tx(async (tx) => {
        for (const [key, value] of entries) {
          if (value === null) {
            await tx.query('DELETE FROM settings WHERE key = $1', [key])
          } else {
            await tx.query(
              `INSERT INTO settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
              [key, value]
            )
          }
        }
      })
    }
  }
}