import type { DB } from '../connection'

export interface SettingsRepository {
  get(key: string): string | null
  getAll(): Record<string, string>
  set(key: string, value: string | null): void
  setMany(entries: Array<[string, string | null]>): void
}

export function settingsRepository(db: DB): SettingsRepository {
  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const getAllStmt = db.prepare('SELECT key, value FROM settings')
  const setStmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const deleteStmt = db.prepare('DELETE FROM settings WHERE key = ?')

  const tx = db.transaction((entries: Array<[string, string | null]>) => {
    for (const [key, value] of entries) {
      if (value === null) {
        deleteStmt.run(key)
      } else {
        setStmt.run(key, value)
      }
    }
  })

  return {
    get(key: string): string | null {
      const row = getStmt.get(key) as { value: string } | undefined
      return row?.value ?? null
    },
    getAll(): Record<string, string> {
      const rows = getAllStmt.all() as Array<{ key: string; value: string }>
      const out: Record<string, string> = {}
      for (const row of rows) out[row.key] = row.value
      return out
    },
    set(key: string, value: string | null): void {
      tx([[key, value]])
    },
    setMany(entries: Array<[string, string | null]>): void {
      tx(entries)
    }
  }
}