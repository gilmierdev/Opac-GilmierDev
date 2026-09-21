import type { ConnectionConfig } from '@shared/types'

export interface RemoteEndpoint {
  fetchText: (path: string, init?: RequestInit) => Promise<Response>
}

export function apiBaseUrl(config: ConnectionConfig): string {
  const host = config.host.trim().replace(/^https?:\/\//, '')
  return `http://${host}:${config.port}`
}

export function remoteClient(getConfig: () => ConnectionConfig | null): RemoteEndpoint {
  return {
    async fetchText(path: string, init?: RequestInit): Promise<Response> {
      const config = getConfig()
      if (!config || !config.token) {
        throw new Error('No library server connection configured')
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      try {
        return await fetch(`${apiBaseUrl(config)}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${config.token}`,
            ...init?.headers
          }
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('The library server took too long to respond')
        }
        throw new Error('Could not reach the library server')
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}

export async function fetchJson<T>(client: RemoteEndpoint, path: string): Promise<T> {
  const res = await client.fetchText(path)
  if (res.status === 401) {
    throw new Error('Access token was rejected by the library server')
  }
  if (!res.ok) {
    throw new Error(`The library server returned an error (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}