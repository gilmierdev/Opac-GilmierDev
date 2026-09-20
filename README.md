# OPAC Library System

A production-ready, fully offline **OPAC (Online Public Access Catalog) Library Desktop Application** for Windows. Built with Electron, React, TypeScript, and SQLite.

## Features

**Public catalog**
- Browse, search, and advanced-search the collection (title, author, ISBN, subject, keyword, year range, and more)
- Sort and filter results (availability, category, author, publisher)
- Book detail pages with cover images, availability status, and copy counts
- Pagination throughout

**Admin management** (password-protected)
- Dashboard with statistics (books, copies, borrowings, overdue)
- Full CRUD for books (with cover image upload), authors, categories, and publishers
- Archiving instead of hard-deletes (soft deletion)
- Borrowing records: check out, mark returned, overdue tracking
- Library settings: name, contact info, logo, theme, backups
- First-run administrator setup (bcrypt-hashed passwords)

**Data & security**
- 100% local: SQLite database (`better-sqlite3`) stored under the user's AppData
- Backups: create on demand, restore from file, with automatic pre-restore snapshot
- Search index via SQLite FTS5
- Hardened Electron profile: context isolation, sandbox, no node integration, strict CSP

## Tech stack

- Electron 44 + electron-vite + electron-builder
- React 19, React Router 7, Zustand, lucide-react
- Tailwind CSS v4
- TypeScript 5.9
- better-sqlite3, bcryptjs

## Getting started

```bash
npm install          # installs deps; postinstall rebuilds better-sqlite3 for Electron
npm run dev          # run in development (hot reload)
npm run typecheck    # TS typecheck (main + renderer)
npm run smoke        # headless main-process + database smoke test (in .smoke-tmp)
npm run build        # typecheck + production build into out/
npm run preview      # run the production build locally
npm run icon         # regenerate build/icon.png + build/icon.ico
npm run build:win    # build + package Windows NSIS installer into release/
```

The Windows installer is written to `release/OPAC-Library-System-Setup-<version>.exe`.

> Note: on Windows, the Electron child processes don't attach their console output to the parent terminal. `npm run smoke` reports success/failure via its exit code; run `npm run build` first so `out/` is up to date.

## Local data

All user data lives under `%APPDATA%\opac-library-system\`:

| Path | Purpose |
|---|---|
| `data/opac.db` | SQLite database (migrations run automatically) |
| `book-images/` | Uploaded / seeded cover images |
| `backups/` | Backup snapshots (`*.db`) |
| `logs/` | Application log files |

## Project structure

```
electron/
  main.ts                     # app bootstrap, window, IPC wiring, smoke mode
  smoke.ts                    # headless DB smoke test
  services/                   # auth, backups, book images, settings, ipc
  database/                   # connection, migrations, seed, repositories
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
electron-builder.yml          # NSIS packaging config
```

## Architecture notes

- The renderer talks to the main process only through a single typed IPC bridge (`window.api`) with a `{ ok, data }` envelope; errors are mapped to an `OpacError` variant.
- Admin-only operations are gated in the main process via an in-memory session (`authService`), so the UI is never trusted as the security boundary.
- Book cover images are served through a private `opac-img://` scheme allowed by the renderer CSP.
- Migrations are versioned (`schema_migrations`) and idempotent; dev-only seed data (10 books / 5 authors / 5 categories / 3 publishers) is generated when no data exists and `NODE_ENV !== 'production'`.