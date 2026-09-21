import { app, shell } from 'electron'
import type { AppDirs, SystemDirs } from '../config/paths'
import type { Db } from '../database/pg/client'
import { pgDb } from '../database/pg/client'
import type { PostgresProvisioner } from '../database/pg/provision'
import type { Repositories } from '../database/pg/repositories'
import { repositories } from '../database/pg/repositories'
import { runMigrations, currentSchemaVersion } from '../database/pg/migrations'
import { authService } from './auth.service'
import { settingsService } from './settings.service'
import { apiTokenService } from './api-token.service'
import { configStore } from './config.service'
import { networkService } from './server.service'
import { networkAdminService } from './network-admin.service'
import { bookImageService } from './book-image.service'
import { backupService } from './backup.service'
import type { Services } from '../ipc/types'
import type { DatabaseStatus } from '@shared/types'
import { logger } from '../utils/logger'

export interface AdminServicesResult {
  services: Services
  db: Db
  provisioner: PostgresProvisioner
  repo: Repositories
}

export function buildAdminServices(
  appDirs: AppDirs,
  systemDirs: SystemDirs,
  provisioner: PostgresProvisioner,
  broadcastCallbacks: {
    broadcastSettings: () => void
    broadcastSession: () => void
  }
): () => Promise<AdminServicesResult> {
  return async (): Promise<AdminServicesResult> => {
    const info = await provisioner.ensure()
    const db = pgDb({
      host: '127.0.0.1',
      port: info.port,
      user: info.appUser,
      password: info.appUserPassword,
      database: info.database
    })

    await runMigrations(db)
    const repo = repositories(db)

    const auth = authService(repo)
    const settings = settingsService(repo)
    const tokenService = apiTokenService(repo)
    const cfg = configStore(systemDirs)
    const images = bookImageService(systemDirs.imagesDir)

    const network = networkService(
      {
        repos: repo,
        tokenService,
        imagesDir: systemDirs.imagesDir,
        libraryName: async () => (await settings.getAll()).library_name,
        libraryAddress: async () => (await settings.getAll()).library_address,
        libraryContact: async () => (await settings.getAll()).contact_info,
        libraryLogo: async () => (await settings.getAll()).library_logo
      },
      () => cfg.get()
    )

    const backup = backupService({
      db,
      imagesDir: systemDirs.imagesDir,
      backupsDir: systemDirs.backupsDir,
      getSchemaVersion: () => currentSchemaVersion(db),
      getLibraryName: () => settings.getAll().then((s) => s.library_name)
    })

    const databaseService = {
      async status(): Promise<DatabaseStatus> {
        const [schemaVersion, libraryName] = await Promise.all([
          currentSchemaVersion(db),
          settings.getAll().then((s) => s.library_name)
        ])
        return {
          connected: true,
          version: 'PostgreSQL',
          schemaVersion,
          libraryName
        }
      }
    }

    const services: Services = {
      dirs: appDirs,
      installInfo: async () => ({
        mode: 'admin',
        dataDir: systemDirs.root,
        legacySqlitePath: appDirs.dbPath,
        postgres: {
          managed: true,
          port: info.port,
          database: info.database
        },
        apiPort: cfg.get().apiPort
      }),
      mode: async () => 'admin',
      auth,
      settings,
      images,
      backup,
      books: {
        list: (filters) => repo.books.list(filters),
        get: (id) => repo.books.getById(id),
        create: (input) => repo.books.create(input),
        update: (id, input) => repo.books.update(id, input),
        archive: (id) => repo.books.archive(id),
        restore: (id) => repo.books.restore(id),
        stats: () => repo.books.dashboardStats()
      },
      authors: repo.authors,
      categories: repo.categories,
      publishers: repo.publishers,
      borrowings: {
        list: (filters) => repo.borrowings.list(filters),
        create: (input) => repo.borrowings.create(input),
        return: (id) => repo.borrowings.recordReturn(id)
      },
      network: networkAdminService(network, tokenService, () => cfg.get().apiPort),
      database: databaseService,
      connection: null,
      isAuthenticated: () => auth.isAuthenticated(),
      openPath: async (path) => {
        const result = await shell.openPath(path)
        if (result) throw new Error(`Unable to open path: ${result}`)
      },
      restart: () => {
        app.relaunch()
        app.exit(0)
      },
      broadcastSettings: broadcastCallbacks.broadcastSettings,
      broadcastSession: broadcastCallbacks.broadcastSession
    }

    logger.info('admin services initialised', { port: info.port, database: info.database })
    return { services, db, provisioner, repo }
  }
}