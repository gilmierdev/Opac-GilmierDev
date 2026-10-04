import type { FastifyInstance } from 'fastify'
import type { Services } from '../ipc/types'
import type { BookFilters, BookInput, AdminUser } from '@shared/types'
import { randomBytes } from 'node:crypto'

export interface AdminRoutesDeps {
  services: Services
}

// In-memory token store for Phase 1 decoupling
const ACTIVE_TOKENS = new Map<string, AdminUser>()

export function adminRoutes(fastify: FastifyInstance, deps: AdminRoutesDeps) {
  const { services } = deps

  // Admin Auth Middleware
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url
    if (!url.startsWith('/api/v1/admin/')) return
    if (url.startsWith('/api/v1/admin/auth/login')) return
    if (url.startsWith('/api/v1/admin/auth/needs-setup')) return
    if (url.startsWith('/api/v1/admin/auth/setup')) return
    if (url === '/api/v1/admin/auth/session') return // Handled explicitly below

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' })
    }
    
    const token = authHeader.substring(7)
    const user = ACTIVE_TOKENS.get(token)
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'Invalid or expired token' })
    }
    
    // Attach user to request for downstream routes if needed
    (request as any).adminUser = user
  })

  // Auth
  fastify.post('/api/v1/admin/auth/login', async (request) => {
    try {
      const { username, password } = request.body as any
      if (!services.auth) throw new Error('Auth service unavailable')
      const user = await services.auth.login(username, password)
      const token = randomBytes(32).toString('hex')
      ACTIVE_TOKENS.set(token, user)
      return { ok: true, data: { user, token } }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/logout', async (request) => {
    try {
      const token = request.headers.authorization?.substring(7)
      if (token) ACTIVE_TOKENS.delete(token)
      if (services.auth) await services.auth.logout()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.get('/api/v1/admin/auth/session', async (request) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return { ok: true, data: null }
    }
    const token = authHeader.substring(7)
    const user = ACTIVE_TOKENS.get(token)
    return { ok: true, data: user || null }
  })

  // Books
  fastify.get('/api/v1/admin/books', async (request) => {
    try {
      const filters = request.query as BookFilters
      if (!services.books) throw new Error('Books service unavailable')
      const data = await services.books.list(filters)
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/books', async (request) => {
    try {
      const input = request.body as BookInput
      if (!services.books) throw new Error('Books service unavailable')
      const data = await services.books.create(input)
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Generic RPC endpoint for all other Admin UI operations
  fastify.post('/api/v1/admin/rpc', async (request) => {
    try {
      const { service, method, args } = request.body as { service: string, method: string, args: any[] }
      
      const svc = (services as any)[service]
      if (!svc) throw new Error(`Service ${service} not found`)
      
      const fn = svc[method]
      if (typeof fn !== 'function') throw new Error(`Method ${method} not found on ${service}`)
      
      const result = await fn.apply(svc, args || [])
      return { ok: true, data: result }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
}
