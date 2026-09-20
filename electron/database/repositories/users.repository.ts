import type { DB } from '../connection'
import { now } from './utils'
import type { AdminUser } from '@shared/types'

export interface AdminUserRecord {
  username: string
  passwordHash: string
  full_name?: string | null
}

export interface UsersRepository {
  hasAdmin(): boolean
  count(): number
  findByUsername(username: string): { id: number } | undefined
  create(input: AdminUserRecord): AdminUser
  createFirstAdmin(input: AdminUserRecord): AdminUser
  updatePassword(id: number, passwordHash: string): void
  getById(id: number): AdminUser | null
  verifyPassword(id: number, passwordHash: string): boolean
}

export function usersRepository(db: DB): UsersRepository {
  const countStmt = db.prepare('SELECT COUNT(*) as c FROM admin_users')
  const findByNameStmt = db.prepare('SELECT id FROM admin_users WHERE lower(username) = lower(?)')
  const insertStmt = db.prepare(`
    INSERT INTO admin_users (username, password_hash, full_name, created_at, updated_at)
    VALUES (@username, @password_hash, @full_name, @created_at, @updated_at)
  `)
  const updatePasswordStmt = db.prepare(`
    UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?
  `)
  const getByIdStmt = db.prepare(`
    SELECT id, username, full_name, created_at FROM admin_users WHERE id = ?
  `)

  return {
    hasAdmin(): boolean {
      const row = countStmt.get() as { c: number }
      return row.c > 0
    },
    count(): number {
      const row = countStmt.get() as { c: number }
      return row.c
    },
    findByUsername(username: string) {
      return findByNameStmt.get(username) as { id: number } | undefined
    },
    create(input) {
      const ts = now()
      const result = insertStmt.run({
        username: input.username,
        password_hash: input.passwordHash,
        full_name: input.full_name ?? null,
        created_at: ts,
        updated_at: ts
      })
      return getByIdStmt.get(result.lastInsertRowid) as AdminUser
    },
    createFirstAdmin(input) {
      return this.create(input)
    },
    updatePassword(id, passwordHash) {
      updatePasswordStmt.run(passwordHash, now(), id)
    },
    getById(id) {
      return (getByIdStmt.get(id) as AdminUser) ?? null
    },
    verifyPassword(id, passwordHash) {
      const row = db
        .prepare('SELECT password_hash FROM admin_users WHERE id = ?')
        .get(id) as { password_hash: string } | undefined
      return row?.password_hash === passwordHash
    }
  }
}