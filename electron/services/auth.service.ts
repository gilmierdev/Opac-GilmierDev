import bcrypt from 'bcryptjs'
import type { DB } from '../database/connection'
import { usersRepository } from '../database/repositories/users.repository'
import type { AdminUser, CreateAdminInput } from '@shared/types'
import { logger } from '../utils/logger'

const SALT_ROUNDS = 12

export interface SessionInfo {
  user: AdminUser
  expiresAt: number
}

export interface AuthService {
  needsSetup(): boolean
  setup(input: CreateAdminInput): AdminUser
  login(username: string, password: string): AdminUser
  logout(): void
  getSession(): AdminUser | null
  changePassword(currentPassword: string, newPassword: string): void
  validatePasswordStrength(password: string): string | null
}

export function authService(getDb: () => DB): AuthService {
  let sessionUserId: number | null = null

  return {
    needsSetup(): boolean {
      const db = getDb()
      return !usersRepository(db).hasAdmin()
    },

    setup(input: CreateAdminInput): AdminUser {
      const db = getDb()
      const repo = usersRepository(db)
      if (repo.hasAdmin()) {
        throw new Error('An administrator account already exists')
      }
      const username = input.username.trim()
      if (!username || username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }
      if (!input.password || input.password.length < 8) {
        throw new Error('Password must be at least 8 characters')
      }
      const passwordHash = bcrypt.hashSync(input.password, SALT_ROUNDS)
      const user = repo.createFirstAdmin({
        username,
        passwordHash,
        full_name: input.full_name?.trim() || null
      })
      sessionUserId = user.id
      logger.info('administrator account created', { username })
      return user
    },

    login(username: string, password: string): AdminUser {
      const db = getDb()
      const trimmed = username.trim()
      const user = usersRepository(db).findByUsername(trimmed)
      if (!user) {
        throw new Error('Invalid username or password')
      }
      const row = db
        .prepare('SELECT id, username, full_name, password_hash, created_at FROM admin_users WHERE id = ?')
        .get(user.id) as {
        id: number
        username: string
        full_name: string | null
        password_hash: string
        created_at: string
      }
      if (!bcrypt.compareSync(password, row.password_hash)) {
        throw new Error('Invalid username or password')
      }
      sessionUserId = row.id
      return { id: row.id, username: row.username, full_name: row.full_name, created_at: row.created_at }
    },

    logout(): void {
      sessionUserId = null
      logger.info('administrator logged out')
    },

    getSession(): AdminUser | null {
      if (sessionUserId == null) return null
      const db = getDb()
      const user = usersRepository(db).getById(sessionUserId)
      return user
    },

    changePassword(currentPassword: string, newPassword: string): void {
      const db = getDb()
      if (sessionUserId == null) {
        throw new Error('Not authenticated')
      }
      const row = db
        .prepare('SELECT password_hash, username, full_name, created_at FROM admin_users WHERE id = ?')
        .get(sessionUserId) as {
        password_hash: string
        username: string
        full_name: string | null
        created_at: string
      }
      if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
        throw new Error('Current password is incorrect')
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters')
      }
      const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS)
      usersRepository(db).updatePassword(sessionUserId, hash)
      logger.info('administrator password changed')
    },

    validatePasswordStrength(password: string): string | null {
      if (!password || password.length < 8) {
        return 'Password must be at least 8 characters'
      }
      if (!/[A-Za-z]/.test(password)) {
        return 'Password must contain at least one letter'
      }
      if (!/\d/.test(password)) {
        return 'Password must contain at least one number'
      }
      return null
    }
  }
}