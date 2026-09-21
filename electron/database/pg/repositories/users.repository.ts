import type { Db } from '../client'
import { nowIso, toIso } from './utils'
import type { AdminUser } from '@shared/types'

export interface AdminUserRecord {
  username: string
  passwordHash: string
  full_name?: string | null
}

export interface AdminUserRow {
  id: number | string
  username: string
  full_name: string | null
  created_at: Date | string
}

export interface UsersRepository {
  hasAdmin(): Promise<boolean>
  count(): Promise<number>
  findByUsername(username: string): Promise<{ id: number } | null>
  create(input: AdminUserRecord): Promise<AdminUser>
  createFirstAdmin(input: AdminUserRecord): Promise<AdminUser>
  updatePassword(id: number, passwordHash: string): Promise<void>
  getById(id: number): Promise<AdminUser | null>
  getPasswordHash(id: number): Promise<string | null>
}

export function usersRepository(db: Db): UsersRepository {
  function mapUser(row: AdminUserRow): AdminUser {
    return {
      id: Number(row.id),
      username: row.username,
      full_name: row.full_name,
      created_at: toIso(row.created_at)
    }
  }

  return {
    async hasAdmin(): Promise<boolean> {
      const row = await db.one<{ c: number }>('SELECT COUNT(*)::int AS c FROM admin_users')
      return (row?.c ?? 0) > 0
    },
    async count(): Promise<number> {
      const row = await db.one<{ c: number }>('SELECT COUNT(*)::int AS c FROM admin_users')
      return row?.c ?? 0
    },
    async findByUsername(username: string): Promise<{ id: number } | null> {
      const row = await db.one<{ id: number }>(
        'SELECT id FROM admin_users WHERE lower(username) = lower($1)',
        [username]
      )
      return row ? { id: Number(row.id) } : null
    },
    async create(input: AdminUserRecord): Promise<AdminUser> {
      const ts = nowIso()
      const row = await db.one<AdminUserRow>(
        `INSERT INTO admin_users (username, password_hash, full_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, full_name, created_at`,
        [input.username, input.passwordHash, input.full_name ?? null, ts, ts]
      )
      if (!row) throw new Error('Failed to create administrator account')
      return mapUser(row)
    },
    async createFirstAdmin(input: AdminUserRecord): Promise<AdminUser> {
      return this.create(input)
    },
    async updatePassword(id: number, passwordHash: string): Promise<void> {
      await db.query('UPDATE admin_users SET password_hash = $1, updated_at = $2 WHERE id = $3', [
        passwordHash,
        nowIso(),
        id
      ])
    },
    async getById(id: number): Promise<AdminUser | null> {
      const row = await db.one<AdminUserRow>(
        'SELECT id, username, full_name, created_at FROM admin_users WHERE id = $1',
        [id]
      )
      return row ? mapUser(row) : null
    },
    async getPasswordHash(id: number): Promise<string | null> {
      const row = await db.one<{ password_hash: string }>(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [id]
      )
      return row?.password_hash ?? null
    }
  }
}