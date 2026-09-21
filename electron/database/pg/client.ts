import pg, { type QueryResult, type QueryResultRow } from 'pg'
import { logger } from '../../utils/logger'

export interface ConnectionOptions {
  host?: string
  port: number
  user: string
  password: string
  database: string
}

/** A connection that can run queries (no transactions or lifecycle). */
export type Queryable = Pick<Db, 'query' | 'one' | 'many'>

export interface Tx {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>
  one<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>
  many<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>
}

export interface Db {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>
  one<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>
  many<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
  end(): Promise<void>
}

function txFromClient(client: pg.PoolClient): Tx {
  return {
    async query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
      return client.query<T>(text, params as unknown[])
    },
    async one<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T | null> {
      const res = await client.query<T>(text, params as unknown[])
      return res.rows[0] ?? null
    },
    async many<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
      const res = await client.query<T>(text, params as unknown[])
      return res.rows
    }
  }
}

/**
 * Thin promise-based facade over a node-postgres pool. Repositories depend on
 * `Db` so the rest of the application never deals with a raw pool/client.
 */
export function pgDb(options: ConnectionOptions): Db {
  const pool = new pg.Pool({
    host: options.host ?? '127.0.0.1',
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'opac-library-system'
  })

  pool.on('error', (err) => {
    logger.error('postgres pool error', err)
  })

  const db: Db = {
    async query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
      return pool.query<T>(text, params as unknown[])
    },
    async one<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T | null> {
      const res = await pool.query<T>(text, params as unknown[])
      return res.rows[0] ?? null
    },
    async many<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
      const res = await pool.query<T>(text, params as unknown[])
      return res.rows
    },
    async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(txFromClient(client))
        await client.query('COMMIT')
        return result
      } catch (err) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // ignore rollback errors
        }
        throw err
      } finally {
        client.release()
      }
    },
    async end(): Promise<void> {
      await pool.end()
    }
  }

  return db
}