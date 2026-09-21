import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionConfig, ConnectionStatus } from '@shared/types'
import { logger } from '../utils/logger'

export function connectionFilePath(userDataDir: string): string {
  return join(userDataDir, 'connection.json')
}

export interface ConnectionStore {
  get(): ConnectionConfig | null
  save(config: ConnectionConfig): void
  reset(): void
  test(config: ConnectionConfig): Promise<ConnectionStatus>
}

function sanitizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export function connectionStore(userDataDir: string): ConnectionStore {
  return {
    get(): ConnectionConfig | null {
      const file = connectionFilePath(userDataDir)
      try {
        if (!existsSync(file)) return null
        const raw = JSON.parse(readFileSync(file, 'utf8')) as {
          host?: unknown
          port?: unknown
          token?: unknown
        }
        if (
          typeof raw.host !== 'string' ||
          !raw.host.trim() ||
          typeof raw.port !== 'number' ||
          typeof raw.token !== 'string'
        ) {
          return null
        }
        return { host: sanitizeHost(raw.host), port: raw.port, token: raw.token }
      } catch (err) {
        logger.error('failed to read connection configuration', err)
        return null
      }
    },
    save(config: ConnectionConfig): void {
      const clean: ConnectionConfig = {
        host: sanitizeHost(config.host),
        port: config.port,
        token: config.token.trim()
      }
      writeFileSync(connectionFilePath(userDataDir), JSON.stringify(clean, null, 2), 'utf8')
      logger.info('connection configuration saved')
    },
    reset(): void {
      try {
        unlinkSync(connectionFilePath(userDataDir))
      } catch {
        // no-op when not present
      }
      logger.info('connection configuration reset')
    },
    async test(config: ConnectionConfig): Promise<ConnectionStatus> {
      const host = sanitizeHost(config.host)
      const port = config.port
      const token = config.token.trim()
      if (!host || !port || !token) {
        return { ok: false, error: 'Enter the server address, port and access token' }
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(`http://${host}:${port}/api/v1/library`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.status === 401) {
          return { ok: false, error: 'Access token was rejected' }
        }
        if (!res.ok) {
          return { ok: false, error: `Server returned HTTP ${res.status}` }
        }
        const data = (await res.json()) as {
          name?: string
          address?: string
          contact_info?: string
          api_version?: string
        }
        return {
          ok: true,
          library_name: data.name ?? 'OPAC Library',
          library_address: data.address ?? '',
          contact_info: data.contact_info ?? '',
          api_version: data.api_version
        }
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'AbortError'
            ? 'Connection timed out'
            : 'Could not reach the library server'
        return { ok: false, error: message }
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}