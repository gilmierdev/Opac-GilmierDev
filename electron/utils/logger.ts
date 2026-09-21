import { mkdirSync, appendFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 5 * 1024 * 1024

let logFile: string | null = null

export function initLogger(dirs: { logsDir: string }): void {
  logFile = join(dirs.logsDir, 'app.log')
  if (!existsSync(dirs.logsDir)) {
    mkdirSync(dirs.logsDir, { recursive: true })
  }
  if (existsSync(logFile)) {
    try {
      const size = statSync(logFile).size
      if (size > MAX_LOG_BYTES) {
        appendFileSync(logFile, '\n[log rotated]\n')
      }
    } catch {
      // ignore
    }
  }
}

function timestamp(): string {
  return new Date().toISOString()
}

export function log(level: LogLevel, message: string, meta?: unknown): void {
  const detail = meta === undefined ? '' : ` ${safeStringify(meta)}`
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}${detail}\n`

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(line.trimEnd())
  }

  if (logFile) {
    try {
      appendFileSync(logFile, line)
    } catch {
      // logging must never crash the app
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet()
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'string' && /pass(word)?/i.test(v) && _key.toLowerCase().includes('pass')) {
        return '[redacted]'
      }
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
      }
      return v
    })
  } catch {
    return String(value)
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta)
}