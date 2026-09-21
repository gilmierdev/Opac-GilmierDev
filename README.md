# OPAC Library System

A production-ready, **OPAC (Online Public Access Catalog) Library Desktop Application** for Windows. Built with Electron, React, TypeScript, and an embedded PostgreSQL database.

The installer offers two install locations/editions:

- **Admin** — installs per-machine (`Program Files`), hosts the embedded PostgreSQL database and the LAN HTTP API, and provides the full management UI.
- **User** — installs per-user, runs as a read-only catalog client connecting over the network to an Admin install (no database, no admin screens).

## Features

**Public catalog**
- Browse, search, and advanced-search the collection (title, author, ISBN, subject, keyword, year range, and more)
- Sort and filter results (availability, category, author, publisher)
- Book detail pages with cover images, availability status, and copy counts
- Pagination throughout

**Admin management** (password-protected)
- Dashboard with statistics (books, copies, borrowings, overdue) and network server status
- Full CRUD for books (with cover image upload), authors, categories, and publishers
- Archiving instead of hard-deletes (soft deletion)
- Borrowing records: check out, mark returned, overdue tracking
- Library settings: name, contact info, logo, theme, backups
- First-run administrator setup (bcrypt-hashed passwords)
- Network page: start/stop the server, change the API port, regenerate the connection token, copy firewall/LAN instructions

**Data & security**
- Managed embedded PostgreSQL (`@embedded-postgres`), loopback-only on the Admin machine
- Secrets at rest (DB passwords, connection token) are encrypted with OS DPAPI via Electron `safeStorage`
- Login throttle, enforced password strength, and session invalidation on password change
- Backup restore validates columns against the live schema (blocks SQL injection via crafted backups)
- Legacy SQLite databases from previous installs are migrated automatically on first Admin run
- User machines store only their connection settings — no library data
- Hardened Electron profile: context isolation, sandbox, no node integration, strict CSP; covers served via a private `opac-img://` scheme

See [SECURITY.md](./SECURITY.md) and [THREAT_MODEL.md](./THREAT_MODEL.md) for the full security documentation and threat analysis.

## Tech stack

- Electron 44 + electron-vite + electron-builder
- React 19, React Router 7, Zustand, lucide-react
- Tailwind CSS v4
- TypeScript 5.9
- Fastify 5 (HTTP API, token + rate limited), pg, embedded-postgres, bcryptjs

## Getting started

```bash
npm install          # installs deps; postinstall rebuilds native modules for Electron
npm run dev          # run in development (hot reload)
npm run typecheck    # TS typecheck (main + renderer)
npm run smoke        # headless main-process + PostgreSQL smoke test (in .smoke-tmp)
npm run build        # typecheck + production build into out/
npm run start        # run the production build locally (build first)
npm run preview      # run the production build locally
npm run icon         # regenerate build/icon.png + build/icon.ico
npm run build:win    # build + package both Windows NSIS installers into release/
npm run dist:admin   # package the Admin (library server) installer only
npm run dist:user    # package the User (catalog client) installer only
```

Installers are written to `release/OPAC-Library-System-Admin-Setup-<version>.exe` and `release/OPAC-Library-System-User-Setup-<version>.exe`.

> Note: on Windows, the Electron child processes don't attach their console output to the parent terminal. `npm run smoke` reports success/failure via its exit code; run `npm run build` first so `out/` is up to date.

## Install modes

There are two dedicated Windows installers; each writes a fixed mode to `%PROGRAMDATA%\OpacLibrarySystem\install.json` (the uninstaller removes it). Admin mode additionally writes a per-user copy under `%APPDATA%\opac-library-system\`.

- **Admin installer** (`...-Admin-Setup-<version>.exe`): hosts the library database and catalog server; `install.json` gets `"mode":"admin"`.
- **User installer** (`...-User-Setup-<version>.exe`): catalog client for other computers; `install.json` gets `"mode":"user"`.

The mode can be overridden at launch:

- CLI flag: `electron . --mode=user` / `--mode=admin`
- Environment: `OPAC_MODE=user`

A User install reads its cached connection on startup and falls back to the connect page (`/connect`) where you enter the Admin server's address, port, and the connection token shown on the Admin **Network Server** page.

## Data & ports

| Item | Value |
|---|---|
| Admin data root | `%PROGRAMDATA%\OpacLibrarySystem` |
| Legacy per-user data | `%APPDATA%\opac-library-system\data` (migrated on first Admin run) |
| Managed PostgreSQL | loopback only, port `54321` (override: `OPAC_PG_PORT`), app role `opac` / db `opac` |
| HTTP API port | `47821` (changeable in Network page) |
| Auth | Admin: password login. User client / browser: bearer token (`Authorization: Bearer <token>`) |

## Project structure

```
electron/
  main.ts                     # app bootstrap, window, IPC wiring, smoke mode
  smoke.ts                    # headless DB smoke test
  config/                     # mode detection + install.json, system/user dirs
  services/                   # auth, backups, book images, settings, ipc, admin services
  database/pg/                # provisioner, repositories, migrations, schema
  database/migrate-sqlite.service.ts  # legacy SQLite -> PostgreSQL migration
  utils/                      # logger, paths
preload/
  index.ts                    # typed, secured preload bridge (window.api)
src/
  App.tsx / main.tsx          # routes + renderer entry
  components/ styles/ lib/    # UI kit, Tailwind, helpers
  pages/ layouts/ stores/     # public + admin screens, layouts, Zustand stores
shared/
  api.ts                      # shared IPC contract types
scripts/
  generate-icon.mjs           # zero-dependency app icon generator
electron-builder.base.yml   # shared NSIS/packaging config
builder.admin.yml           # Admin installer overrides (artifact name + NSIS hooks)
builder.user.yml            # User installer overrides (artifact name + NSIS hooks)
build/
  installer-admin.nsh       # NSIS hooks writing "admin" mode to install.json
  installer-user.nsh        # NSIS hooks writing "user" mode to install.json
  installer-mode.nsh        # shared NSIS customInstall/customUnInstall macros
```

## Architecture notes

- The renderer talks to the main process only through a single typed IPC bridge (`window.api`) with a `{ ok, data }` envelope; errors are mapped to an `OpacError` variant.
- Admin-only operations are gated in the main process via an in-memory session (`authService`), so the UI is never trusted as the security boundary.
- In User mode the app talks directly to the remote Admin HTTP API; admin routes are not registered in the renderer.
- Book cover images are served through a private `opac-img://` scheme allowed by the renderer CSP (local files in Admin mode, proxied over HTTP in User mode).
- Migrations are versioned (`schema_migrations`) and idempotent.