import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import pg from 'pg'
import type { SystemDirs } from '../../config/paths'
import { logger } from '../../utils/logger'
import { encryptSecret, decryptSecret, isEncrypted } from '../../utils/crypto'

/** Port override for the embedded PostgreSQL server. Useful when the default
 *  port is already taken (e.g. smoke tests that must not clash with a real
 *  installation). Valid range: 1024-65535. */
function managedPort(): number {
  const raw = process.env.OPAC_PG_PORT
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
      return parsed
    }
    logger.warn('invalid OPAC_PG_PORT value, falling back to default', { value: raw })
  }
  return 54321
}

const MANAGED_PORT = managedPort()

export interface PgClusterInfo extends CredentialsFile {
  binDir: string
  dataDir: string
}

export interface CredentialsFile {
  port: number
  database: string
  superuser: string
  superuserPassword: string
  appUser: string
  appUserPassword: string
  externalBinDir: string | null
  initializedAt: string
}

export type ClusterStatus = 'running' | 'stopped' | 'uninitialized'

const SUPERUSER = 'postgres'
const APP_USER = 'opac'
const APP_DATABASE = 'opac'

function defaultCredentials(): CredentialsFile {
  return {
    port: MANAGED_PORT,
    database: APP_DATABASE,
    superuser: SUPERUSER,
    superuserPassword: randomSecret(),
    appUser: APP_USER,
    appUserPassword: randomSecret(),
    externalBinDir: null,
    initializedAt: new Date().toISOString()
  }
}

function randomSecret(): string {
  return `op${randomBytes(24).toString('base64url')}`
}

/** Resolves the directory that contains the PostgreSQL server binaries. */
export function resolveBinDir(): string {
  const platform = '@embedded-postgres/windows-x64'
  try {
    const entry = require.resolve(platform)
    let base = dirname(entry)
    if (base.includes('app.asar')) {
      base = base.replace('app.asar', 'app.asar.unpacked')
    }
    const candidate = join(base, '..', 'native', 'bin')
    if (existsSync(join(candidate, 'initdb.exe')) || existsSync(join(candidate, 'initdb'))) {
      return candidate
    }
  } catch {
    // fall through
  }
  // Development fallback: resolve from this repository's node_modules.
  const devCandidate = join(__dirname, '..', '..', '..', 'node_modules', platform, 'native', 'bin')
  if (existsSync(devCandidate)) {
    return devCandidate
  }
  throw new Error('PostgreSQL runtime binaries could not be located on this system')
}

function credentialsPath(dirs: SystemDirs): string {
  return join(dirs.databaseDir, 'credentials.json')
}

export function readCredentials(dirs: SystemDirs): CredentialsFile | null {
  try {
    if (!existsSync(credentialsPath(dirs))) return null
    const raw = JSON.parse(readFileSync(credentialsPath(dirs), 'utf-8')) as CredentialsFile
    if (!raw.port || !raw.database || !raw.appUser || !raw.appUserPassword) return null
    try {
      raw.superuserPassword = decryptSecret(raw.superuserPassword)
      raw.appUserPassword = decryptSecret(raw.appUserPassword)
    } catch {
      // Never let a decryption failure masquerade as "fresh install": surface it
      // as null so ensure() fails loudly instead of rotating credentials.
      return null
    }
    return raw
  } catch {
    return null
  }
}

function writeCredentials(dirs: SystemDirs, creds: CredentialsFile): void {
  mkdirSync(dirs.databaseDir, { recursive: true })
  const encrypted: CredentialsFile = {
    ...creds,
    superuserPassword: encryptSecret(creds.superuserPassword),
    appUserPassword: encryptSecret(creds.appUserPassword)
  }
  writeFileSync(credentialsPath(dirs), JSON.stringify(encrypted, null, 2), { mode: 0o600 })
}

/** Upgrades a legacy plaintext credentials file to encrypted storage, but only
 *  after the database has been reached successfully (so we never rotate
 *  credentials or lock the app out because of a transient encryption failure).
 */
function upgradeCredentialsOnDisk(dirs: SystemDirs, info: PgClusterInfo): void {
  try {
    if (!existsSync(credentialsPath(dirs))) return
    const raw = JSON.parse(readFileSync(credentialsPath(dirs), 'utf-8')) as Partial<CredentialsFile>
    if (
      typeof raw.superuserPassword === 'string' &&
      typeof raw.appUserPassword === 'string' &&
      (isEncrypted(raw.superuserPassword) || isEncrypted(raw.appUserPassword))
    ) {
      return
    }
    saveCredentials(dirs, info)
    logger.info('PostgreSQL credentials upgraded to encrypted storage')
  } catch (err) {
    logger.warn('could not upgrade PostgreSQL credentials to encrypted storage', err)
  }
}

function saveCredentials(dirs: SystemDirs, info: PgClusterInfo): void {
  writeCredentials(dirs, {
    port: info.port,
    database: info.database,
    superuser: info.superuser,
    superuserPassword: info.superuserPassword,
    appUser: info.appUser,
    appUserPassword: info.appUserPassword,
    externalBinDir: info.externalBinDir,
    initializedAt: info.initializedAt
  })
}

function execAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

function pgVersionExists(dataDir: string): boolean {
  return existsSync(join(dataDir, 'PG_VERSION'))
}

function ensureListenLocalOnly(dataDir: string, port: number): string {
  const confPath = join(dataDir, 'postgresql.conf')
  let conf = existsSync(confPath) ? readFileSync(confPath, 'utf-8') : ''
  const setLine = (name: string, value: string): void => {
    const re = new RegExp(`^\\s*#?\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=.*$`, 'm')
    const line = `${name} = ${value}`
    if (re.test(conf)) {
      conf = conf.replace(re, line)
    } else {
      conf = `${conf.replace(/\s*$/, '\n')}${line}\n`
    }
  }
  setLine('listen_addresses', "'127.0.0.1'")
  setLine('port', String(port))
  setLine('password_encryption', "'scram-sha-256'")
  writeFileSync(confPath, conf)

  // Lock the cluster down to loopback-only and require a password for every
  // connection: there is deliberately NO `trust` entry. The app manages the
  // server itself (pg_ctl stop uses the server's own control channel, not the
  // network authentication layer), so a trust rule would only let any local
  // process connect to the superuser account without a password.
  const hbaPath = join(dataDir, 'pg_hba.conf')
  const hbaRules = [
    '# PostgreSQL Client Authentication Configuration',
    'host all all 127.0.0.1/32 scram-sha-256',
    'host all all ::1/128 scram-sha-256'
  ].join('\n')
  const existing = existsSync(hbaPath) ? readFileSync(hbaPath, 'utf8') : ''
  let content = existing
  // Strip any legacy loopback trust entries that older versions may have added.
  content = content
    .split('\n')
    .filter((line) => !/^host\s+.+\s+.+\s+(127\.0\.0\.1\/32|::1\/128)\s+trust\s*$/i.test(line.trim()))
    .join('\n')
  if (!/host\s+all\s+all\s+127\.0\.0\.1\/32\s+scram-sha-256/i.test(content)) {
    content = content.trimEnd() + '\n' + hbaRules + '\n'
  }
  writeFileSync(hbaPath, content)

  return hbaPath
}

export interface ProvisionHooks {
  onLog?: (message: string) => void
}

export class PostgresProvisioner {
  private readonly dirs: SystemDirs
  private child: ReturnType<typeof spawn> | null = null
  private readonly onLog: (message: string) => void

  constructor(dirs: SystemDirs, hooks: ProvisionHooks = {}) {
    this.dirs = dirs
    this.onLog = hooks.onLog ?? ((m) => logger.info(m))
  }

  binDir(): string {
    return resolveBinDir()
  }

  /** Path to the managed cluster's pg_hba.conf (exposed for smoke tests). */
  clientAuthConfigPath(): string {
    return join(this.dirs.pgDataDir, 'pg_hba.conf')
  }

  getInfo(): PgClusterInfo | null {
    const creds = readCredentials(this.dirs)
    if (!creds) return null
    return {
      binDir: this.binDir(),
      dataDir: this.dirs.pgDataDir,
      port: creds.port,
      database: creds.database,
      superuser: creds.superuser,
      superuserPassword: creds.superuserPassword,
      appUser: creds.appUser,
      appUserPassword: creds.appUserPassword,
      externalBinDir: creds.externalBinDir,
      initializedAt: creds.initializedAt
    }
  }

  async status(): Promise<ClusterStatus> {
    const bin = this.binDir()
    const dataDir = this.dirs.pgDataDir
    if (!pgVersionExists(dataDir)) return 'uninitialized'
    try {
      const res = await execAsync(join(bin, 'pg_ctl.exe'), ['status', '-D', dataDir])
      return res.stdout.includes('is running') || res.stdout.includes('is a server process running')
        ? 'running'
        : 'stopped'
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('is running') || message.includes('is a server process')) return 'running'
      return 'stopped'
    }
  }

  async isRunning(): Promise<boolean> {
    const status = await this.status()
    return status === 'running'
  }

  /** Initialises the cluster, applies local-only network settings and creates
   *  the dedicated least-privilege application user + database. */
  async ensure(): Promise<PgClusterInfo> {
    const bin = this.binDir()
    const dataDir = this.dirs.pgDataDir
    mkdirSync(dataDir, { recursive: true })

    let creds = readCredentials(this.dirs)
    if (!pgVersionExists(dataDir)) {
      creds = defaultCredentials()
      const pwFile = join(this.dirs.databaseDir, `.initpw-${randomUUID().slice(0, 8)}`)
      writeFileSync(pwFile, `${creds.superuserPassword}\n`)
      this.onLog('Initialising PostgreSQL data directory…')
      try {
        await execAsync(join(bin, 'initdb.exe'), [
          `--pgdata=${dataDir}`,
          '--auth=scram-sha-256',
          `--username=${creds.superuser}`,
          `--pwfile=${pwFile}`,
          '--encoding=UTF8',
          '--lc-messages=C'
        ])
      } finally {
        try {
          const { unlinkSync } = await import('node:fs')
          unlinkSync(pwFile)
        } catch {
          // ignore cleanup failures
        }
      }
      writeCredentials(this.dirs, creds)
      this.onLog('PostgreSQL data directory initialised')
    } else if (!creds) {
      // A data directory exists but the credentials file is missing or
      // undecryptable (e.g. DPAPI key changed). Never re-provision: that would
      // silently rotate the passwords and brick the existing cluster.
      throw new Error(
        'The PostgreSQL data directory already exists but its credentials could not be read or decrypted. Reinstall or run on the Windows account that set up the library.'
      )
    }

    const info: CredentialsFile = this.getInfo() ?? (creds as CredentialsFile)
    ensureListenLocalOnly(dataDir, info.port)

    await this.start()

    const admin = new pg.Client({
      host: '127.0.0.1',
      port: info.port,
      user: info.superuser,
      password: info.superuserPassword,
      database: 'postgres'
    })
    admin.on('error', () => undefined)
    try {
      await admin.connect()
      const roleExists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [info.appUser])
      if (roleExists.rowCount === 0) {
        await admin.query(`CREATE ROLE ${admin.escapeIdentifier(info.appUser)} LOGIN PASSWORD ${admin.escapeLiteral(info.appUserPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE`)
        this.onLog(`Created PostgreSQL application role "${info.appUser}"`)
      }
      const dbExists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [info.database])
      if (dbExists.rowCount === 0) {
        await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(info.database)} OWNER ${admin.escapeIdentifier(info.appUser)}`)
        this.onLog(`Created PostgreSQL database "${info.database}"`)
      }
      await admin.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`)
      await admin.query(`GRANT CONNECT ON DATABASE ${admin.escapeIdentifier(info.database)} TO ${admin.escapeIdentifier(info.appUser)}`)

      // Lock down default public schema so the app user is the only non-superuser writer.
      const appClient = new pg.Client({
        host: '127.0.0.1',
        port: info.port,
        user: info.appUser,
        password: info.appUserPassword,
        database: info.database
      })
      appClient.on('error', () => undefined)
      try {
        await appClient.connect()
        await appClient.query('GRANT ALL ON SCHEMA public TO ' + appClient.escapeIdentifier(info.appUser))
        await appClient.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ' + appClient.escapeIdentifier(info.appUser))
      } finally {
        await appClient.end().catch(() => undefined)
      }
    } finally {
      await admin.end().catch(() => undefined)
    }

    // Rewrite a legacy plaintext credentials file as encrypted only after we
    // have proven we can reach the cluster with the current secrets.
    upgradeCredentialsOnDisk(this.dirs, this.getInfo() ?? this.getInfoAsCluster(info))

    return this.getInfoAsCluster(info)
  }

  private getInfoAsCluster(creds: CredentialsFile): PgClusterInfo {
    return {
      binDir: this.binDir(),
      dataDir: this.dirs.pgDataDir,
      port: creds.port,
      superuser: creds.superuser,
      superuserPassword: creds.superuserPassword,
      appUser: creds.appUser,
      appUserPassword: creds.appUserPassword,
      database: creds.database,
      externalBinDir: creds.externalBinDir,
      initializedAt: creds.initializedAt
    }
  }

  /** Starts the managed PostgreSQL server process and waits until it is ready. */
  async start(): Promise<void> {
    if (await this.isRunning()) return
    const bin = this.binDir()
    const dataDir = this.dirs.pgDataDir
    const info = this.getInfo()
    if (!info) throw new Error('PostgreSQL is not initialised')
    const logFile = join(this.dirs.logsDir, 'postgres.log')
    mkdirSync(this.dirs.logsDir, { recursive: true })

    this.onLog(`Starting local PostgreSQL server (port ${info.port})…`)
    const fs = await import('node:fs')
    const out = fs.openSync(logFile, 'a')

    await new Promise<void>((resolve, reject) => {
      // stdout -> log file, stderr -> pipe so we can detect readiness in the
      // server log stream (PostgreSQL writes its startup logs to stderr).
      const child = spawn(join(bin, 'postgres.exe'), ['-D', dataDir, '-p', String(info.port)], {
        stdio: ['ignore', out, 'pipe'],
        windowsHide: true
      })
      this.child = child
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for PostgreSQL to start'))
      }, 60_000)
      let resolved = false

      const onChunk = (chunk: Buffer): void => {
        const text = chunk.toString()
        this.onLog(text.trimEnd())
        try {
          const fsa = require('node:fs')
          fsa.appendFileSync(logFile, text)
        } catch {
          // ignore log write failures
        }
        if (!resolved && text.includes('database system is ready to accept connections')) {
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      }

      child.stderr?.on('data', onChunk)
      child.stdout?.on('data', onChunk)
      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      child.on('close', (code) => {
        if (code != null && !resolved) {
          clearTimeout(timeout)
          reject(new Error(`PostgreSQL server exited unexpectedly (code ${code})`))
        }
      })
      child.on('exit', () => {
        this.child = null
      })
    }).catch((err) => {
      this.stop().catch(() => undefined)
      throw err
    })
    this.onLog('PostgreSQL is ready')
  }

  /** Stops the managed PostgreSQL server using a fast checkpoint-then-stop. */
  async stop(): Promise<void> {
    const bin = this.binDir()
    const dataDir = this.dirs.pgDataDir
    if (!pgVersionExists(dataDir)) return
    try {
      logger.info('stopping postgres (fast)')
      await execAsync(join(bin, 'pg_ctl.exe'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'])
    } catch (err) {
      logger.warn('pg_ctl stop failed, forcing shutdown', { error: err })
      if (this.child?.pid) {
        try {
          await new Promise<void>((resolve) => {
            const kill = spawn('taskkill', ['/pid', String(this.child?.pid), '/f', '/t'], { windowsHide: true })
            kill.on('close', () => resolve())
          })
        } catch {
          // ignore
        }
      }
    }
    this.child = null
  }

  /**
   * Optionally registers PostgreSQL as a Windows service so the library server
   * database starts with the computer. Requires elevation; gracefully disabled
   * when not available (the app also manages the database process itself).
   */
  async registerWindowsService(name = 'OpacLibraryPostgres'): Promise<{ ok: boolean; error?: string }> {
    const bin = this.binDir()
    const dataDir = this.dirs.pgDataDir
    const info = this.getInfo()
    if (!info) return { ok: false, error: 'PostgreSQL is not initialised' }
    await this.stop()
    try {
      await execAsync(join(bin, 'pg_ctl.exe'), [
        'register',
        '-N',
        name,
        '-D',
        dataDir,
        '-o',
        `-p ${info.port}`,
        '-U',
        'NT AUTHORITY\\NetworkService'
      ])
      await this.start()
      return { ok: true }
    } catch (err) {
      await this.start()
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to register the PostgreSQL service (requires administrator privileges)' }
    }
  }
}

export function provisioner(dirs: SystemDirs, hooks?: ProvisionHooks): PostgresProvisioner {
  return new PostgresProvisioner(dirs, hooks)
}