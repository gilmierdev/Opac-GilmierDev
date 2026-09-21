# Security

This document describes the security properties, hardening measures, and known
limitations of the OPAC Library System desktop application.

## Threat model (summary)

See [THREAT_MODEL.md](./THREAT_MODEL.md) for the full analysis. Highlights:

| Asset | Protection |
|---|---|
| Admin login / sessions | bcrypt (cost 12) hashes, in-memory 12 h sessions, per-username login throttle (5 fails / 5 min window -> 60 s lockout), random 256-bit tokens hashed (SHA-256) at rest |
| Admin UI data (IPC) | `contextIsolation`, `sandbox`, no `nodeIntegration`, sender-origin validation, auth-gated admin handlers in the main process |
| PostgreSQL credentials | random per-install, stored `chmod 0600`, encrypted at rest with OS DPAPI (`safeStorage`), loopback-only, SCRAM-SHA-256 auth, **no `trust` rule** |
| Library data | embedded PostgreSQL, least-privilege `opac` role (no superuser), parameterized queries throughout |
| Backups | folder-scoped restore, column whitelist validated against the live schema (blocks SQL injection via crafted backups), schema-version guard |
| User client tokens | encrypted at rest with OS DPAPI (`safeStorage`) |

## Defense-in-depth for the renderer

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`.
- A single typed IPC bridge (`window.api`) with a `{ ok, data }` envelope.
- Every `ipcMain.handle` validates the sender is the main frame of a real app
  window before running the handler.
- Admin mutating operations are gated in the **main process** (`requireAuth`);
  the renderer is never trusted as the security boundary.
- All `window.open` calls are denied and `will-navigate` allows **only the exact
  renderer entry URL** (hash navigation covers all in-app routing).
- A strict CSP is set via the `index.html` meta tag, including
  `object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'self'`.
- Covers are served through a private `opac-img://` scheme; filenames are
  basename-only and confined to the images directory.
- The LAN HTTP API sends security headers on every response
  (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'`,
  `Cache-Control: no-store`).
- If the app cannot start (e.g. database conflict), it shows an error dialog
  instead of failing silently.

## Secrets at rest

Credentials and tokens are encrypted with Electron `safeStorage` (DPAPI on
Windows), meaning only the same Windows account + machine can decrypt them.
Values are stored with an `enc:` marker; plaintext values written by older
versions are upgraded to encrypted storage automatically on the next successful
startup.

If the DPAPI key is unavailable (different Windows account, re-imaged machine),
the app refuses to decrypt rather than silently rotating credentials, and
surfaces a clear error message.

## PostgreSQL hardening

- Listens on `127.0.0.1` only; the listener port defaults to `54321` and can be
  overridden with the `OPAC_PG_PORT` environment variable (1024-65535).
- `pg_hba.conf` contains only SCRAM-SHA-256 rules for loopback; there is
  deliberately no `trust` entry, so local processes cannot authenticate as the
  `postgres` superuser without a password.
- The application connects as the least-privilege `opac` role. Superuser
  password is only used to provision roles/databases.
- `password_encryption = scram-sha-256`.

## Backup restore safety

Restore is transactional and single-shot:

1. The manifest must match the expected format/version and must not require a
   newer database schema than the current installation.
2. Row values must be scalar (strings, numbers, booleans, null).
3. Every column in the backup is checked against `information_schema.columns`;
   unknown columns are rejected before any SQL runs.
4. The database is replaced inside one transaction that rolls back on error.

## Known limitations / accepted risks

- **HTTP LAN API in cleartext.** The Admin HTTP server (default port `47821`)
  provides a bearer-token Fastify API. Transport is plain HTTP, so the token,
  books, and covers are readable by anyone with LAN packet capture. Readers'
  privacy on the same network is guarded only by the bearer token (256-bit).
  HTTPS would require a trusted certificate (private CA or Let's Encrypt) and
  is out of scope for a LAN appliance. The API has no CORS, a global rate limit
  (200 req/min), and every endpoint requires the token.
- **Legacy-cluster schema upgrades.** Clusters provisioned by earlier developer
  builds whose schema differs from the current `schema_migrations` baseline are
  not auto-migrated in full; the app fails startup with a clear dialog. Fresh
  installs and upgrades *within* the current schema version work without
  intervention (`schema_migrations` itself is upgraded in place).
- **Unsigned installer.** `electron-builder` is not configured with a code
  signing certificate, so Windows SmartScreen will warn when the installer runs.
- **No auto-update.** Updates are manual reinstall; data under
  `%PROGRAMDATA%\OpacLibrarySystem` survives reinstall/updates.
- **Login lockout is per-process.** The throttle map lives in the main process
  and resets when the app restarts.

## Reporting a vulnerability

Please open a private issue or contact the maintainers with a description of the
issue. Avoid sharing exploit payloads (such as crafted backup files) publicly.