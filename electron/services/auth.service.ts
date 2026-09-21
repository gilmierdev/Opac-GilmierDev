import bcrypt from 'bcryptjs'
import type { Repositories } from '../database/pg/repositories'
import type { AdminUser, CreateAdminInput } from '@shared/types'
import { logger } from '../utils/logger'

const SALT_ROUNDS = 12
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface AuthService {
  needsSetup(): Promise<boolean>
  setup(input: CreateAdminInput): Promise<AdminUser>
  login(username: string, password: string): Promise<AdminUser>
  logout(): Promise<void>
  getSession(): Promise<AdminUser | null>
  isAuthenticated(): Promise<boolean>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  validatePasswordStrength(password: string): string | null
}

export function authService(repo: Repositories): AuthService {
  let sessionUserId: number | null = null
  let sessionExpiresAt = 0

  return {
    async needsSetup(): Promise<boolean> {
      return !(await repo.users.hasAdmin())
    },

    async setup(input: CreateAdminInput): Promise<AdminUser> {
      if (await repo.users.hasAdmin()) {
        throw new Error('An administrator account already exists')
      }
      const username = input.username.trim()
      if (!username || username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }
      if (!input.password || input.password.length < 8) {
        throw new Error('Password must be at least 8 characters')
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
      const user = await repo.users.createFirstAdmin({
        username,
        passwordHash,
        full_name: input.full_name?.trim() || null
      })
      sessionUserId = user.id
      sessionExpiresAt = Date.now() + SESSION_TTL_MS
      logger.info('administrator account created', { username })
      return user
    },

    async login(username: string, password: string): Promise<AdminUser> {
      const trimmed = username.trim()
      const match = await repo.users.findByUsername(trimmed)
      if (!match) {
        throw new Error('Invalid username or password')
      }
      const storedHash = await repo.users.getPasswordHash(match.id)
      if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
        throw new Error('Invalid username or password')
      }
      const user = await repo.users.getById(match.id)
      if (!user) throw new Error('Invalid username or password')
      sessionUserId = user.id
      sessionExpiresAt = Date.now() + SESSION_TTL_MS
      logger.info('administrator logged in', { username: user.username })
      return user
    },

    async logout(): Promise<void> {
      sessionUserId = null
      sessionExpiresAt = 0
      logger.info('administrator logged out')
    },

    async getSession(): Promise<AdminUser | null> {
      if (sessionUserId == null || Date.now() >= sessionExpiresAt) return null
      return repo.users.getById(sessionUserId)
    },

    async isAuthenticated(): Promise<boolean> {
      return (await this.getSession()) !== null
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      if (sessionUserId == null) {
        throw new Error('Not authenticated')
      }
      const storedHash = await repo.users.getPasswordHash(sessionUserId)
      if (!storedHash || !bcrypt.compareSync(currentPassword, storedHash)) {
        throw new Error('Current password is incorrect')
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters')
      }
      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
      await repo.users.updatePassword(sessionUserId, hash)
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