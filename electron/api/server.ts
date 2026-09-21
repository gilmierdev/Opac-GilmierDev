import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyError } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { Repositories } from '../database/pg/repositories'
import type { ApiTokenService } from '../services/api-token.service'
import type { BookFilters } from '@shared/types'
import { logger } from '../utils/logger'

export const API_VERSION = '1.0.0'

export interface ApiServerDeps {
  repos: Repositories
  tokenService: ApiTokenService
  imagesDir: string
  libraryName: () => Promise<string>
  libraryAddress: () => Promise<string>
  libraryContact: () => Promise<string>
  libraryLogo: () => Promise<string | null>
  onRequest: (ip: string) => void
}

export interface ApiServer {
  instance: FastifyInstance
  address: string
  port: number
}

function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

function parseBool(value: string | null): boolean | undefined {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

function parseIntOrNull(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export async function buildApiServer(deps: ApiServerDeps): Promise<ApiServer> {
  const fastify = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: 1 * 1024 * 1024
  })

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  })

  const authPreHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token || !(await deps.tokenService.verify(token))) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing access token' })
    }
    void deps.tokenService.recordUsage()
    deps.onRequest(request.ip ?? 'unknown')
  }

  fastify.addHook('preHandler', authPreHandler)

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message })
    }
    logger.error('api error', error)
    return reply.code(500).send({ error: 'Internal server error' })
  })

  fastify.get('/api/v1/health', async () => {
    return {
      ok: true,
      api_version: API_VERSION,
      database: 'connected'
    }
  })

  fastify.get('/api/v1/library', async () => {
    const [name, address, contactInfo, logo] = await Promise.all([
      deps.libraryName(),
      deps.libraryAddress(),
      deps.libraryContact(),
      deps.libraryLogo()
    ])
    return { name, address, contact_info: contactInfo, logo, api_version: API_VERSION }
  })

  const qsFilters = (q: FastifyRequest['query']): BookFilters => {
    const query = q as Record<string, string | undefined>
    return {
      search: query.search ?? undefined,
      category_id: parseIntOrNull(query.category_id ?? null),
      author_id: parseIntOrNull(query.author_id ?? null),
      publisher_id: parseIntOrNull(query.publisher_id ?? null),
      year_from: parseIntOrNull(query.year_from ?? null),
      year_to: parseIntOrNull(query.year_to ?? null),
      availability: (parseBool(query.availability ?? null) === undefined
        ? (query.availability as BookFilters['availability'])
        : parseBool(query.availability ?? null)
          ? 'available'
          : 'unavailable') ?? 'all',
      sort: (query.sort ?? 'title_asc') as BookFilters['sort'],
      page: parseIntOrNull(query.page ?? null) ?? 1,
      pageSize: parseIntOrNull(query.pageSize ?? null) ?? 12
    }
  }

  fastify.get('/api/v1/books', async (request) => {
    return deps.repos.books.list(qsFilters(request.query))
  })

  fastify.get('/api/v1/books/search', async (request) => {
    return deps.repos.books.list(qsFilters(request.query))
  })

  fastify.get<{ Params: { id: string } }>('/api/v1/books/:id', async (request) => {
    const id = parseIntOrNull(request.params.id)
    if (id === null) return { error: 'Invalid book id' }
    const book = await deps.repos.books.getById(id)
    if (!book) return { error: 'Book not found' }
    return book
  })

  fastify.get<{ Params: { filename: string } }>('/api/v1/covers/:filename', async (request, reply) => {
    const filename = request.params.filename.replaceAll('\\', '/').split('/').pop() ?? ''
    if (!filename || /\.\.|[:*?"<>|]/.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' })
    }
    const fullPath = join(deps.imagesDir, filename)
    if (!existsSync(fullPath)) {
      return reply.code(404).send({ error: 'Cover not found' })
    }
    return reply.type(mimeFor(filename)).send(createReadStream(fullPath))
  })

  fastify.get('/api/v1/authors', async () => {
    return deps.repos.authors.list(false)
  })

  fastify.get('/api/v1/categories', async () => {
    return deps.repos.categories.list(false)
  })

  fastify.get('/api/v1/publishers', async () => {
    return deps.repos.publishers.list(false)
  })

  fastify.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'Not found' })
  })

  return { instance: fastify, address: '0.0.0.0', port: 0 }
}