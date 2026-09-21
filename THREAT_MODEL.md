# Threat Model

Scope: the OPAC Library System desktop application — Admin edition (embedded
PostgreSQL + LAN HTTP API) and User edition (read-only catalog client).

Assessment date: September 2026. This is a living document; update it whenever
data flows or trust boundaries change.

## Trust boundaries

```
                          ┌──────────────────────────────────────────┐
  LAN clients (browser,   │  Admin machine                           │
  User edition) ── HTTP ─▶│  Fastify API (token-gated)               │
  Bearer token            │      │                                   │
                          │  Electron renderer ── IPC ── main process│
                          │  (sandbox, ctxIsolation)   │             │
                          │                          pg client       │
                          │  embedded PostgreSQL ───────────────────┐ │
                          │  (loopback only)                       │ │
                          └────────────────────────────────────────┘ │
                                                                    fallback
  Local Windows processes (same user / admin) ── can read/write %PROGRAMDATA%
```

Trust levels:

- **T0 - untrusted network:** LAN clients hold at most a read-only bearer token.
- **T1 - renderer:** runs user-supplied content (search terms, book data); fully
  sandboxed, no node integration.
- **T2 - main process:** trusted; owns credentials, sessions, files.
- **T3 - local processes:** same-machine processes with user or admin rights can
  read the app's files directly (defense against this is `0600` modes and DPAPI
  encryption).
- **T4 - admin/owner:** fully trusted (the operating system trusts them anyway).

## Assets

| # | Asset | Confidentiality | Integrity | Availability | Stored where |
|---|---|---|---|---|---|
| A1 | Admin password hashes | high | high | - | PostgreSQL `admin_users` |
| A2 | Admin session | high | - | - | memory (main process) |
| A3 | LAN API token | high | - | - | hashed in DB, encrypted in client `connection.json` |
| A4 | PostgreSQL superuser + app passwords | high | - | - | `credentials.json` (DPAPI-encrypted) |
| A5 | Catalog data (books, members, borrowings) | medium | high | high | PostgreSQL |
| A6 | Cover images / uploads | medium | medium | medium | `%PROGRAMDATA%\OpacLibrarySystem\book-covers` |
| A7 | Backups | high | high | high | `%PROGRAMDATA%\OpacLibrarySystem\backups` |
| A8 | Library settings | medium | medium | - | PostgreSQL `settings` |
| A9 | Client connection config | medium | - | - | `%APPDATA%` (token DPAPI-encrypted) |

## Attack scenarios and countermeasures

### 1. Local privilege escalation via PostgreSQL trust auth (FIXED - H2)

- **Scenario:** a local, non-admin process runs `psql -U postgres` against the
  embedded cluster. Previous `pg_hba.conf` had
  `host opac postgres 127.0.0.1/32 trust` for tooling convenience, letting any
  local process act as superuser. The postgres server process also runs as the
  logged-in user (embedded postgres), amplifying theft of the superuser role.
- **Fix:** `pg_hba.conf` now contains SCRAM-SHA-256 only for loopback. `pg_ctl`
  stop/status uses the server's internal control channel, not the network auth
  layer, so cluster management still works (verified by smoke test). App
  connects with the least-privilege `opac` role.
- **Residual:** none known. A same-user local attacker can still read
  unencrypted files the app writes with default ACLs; the cluster itself is
  unreachable without a password.

### 2. SQL injection via crafted backup file (FIXED - H1)

- **Scenario:** `pick-and-restore` accepts any folder the user selects; a
  malicious backup `data.json` can carry column names like
  `id"); DROP TABLE books;--` that were interpolated directly into the INSERT
  statement inside the restore transaction. Note: restoring requires the admin
  UI and session, so exploitation needs an authenticated admin to pick the file —
  but a poisoned file from a compromised backup share would execute DDL/DML with
  the app role.
- **Fix:** restore now (a) verifies the manifest schema version is not newer
  than the current DB, (b) requires scalar values only, and (c) whitelists every
  column against `information_schema.columns` before any SQL runs, inside a
  transaction that rolls back on failure.
- **Residual:** TRUNCATE + re-INSERT is destructive by design; the app writes a
  pre-restore snapshot and shows the result of the operation.

### 3. Secrets readable at rest (FIXED - M)

- **Scenario:** `credentials.json` (superuser/app PG passwords) and
  `connection.json` (LAN bearer token) were stored plaintext. Any process
  running as the same user could read them.
- **Fix:** both files now DPAPI-encrypt secrets via Electron `safeStorage`
  (`enc:` marker). Legacy plaintext is upgraded on next successful startup.
  Decrypt failure with an OS key mismatch raises a clear error instead of
  silently re-provisioning.
- **Residual:** an attacker with the same Windows account + kernel access can
  leverage DPAPI via the user's own credential context. This is inherent to
  `safeStorage`; stronger storage would require a hardware key (TPM/Windows
  Hello) or explicit master password.

### 4. Weak admin passwords / brute force (FIXED - M)

- **Scenario:** password setup accepted any ≥8-byte string; login had no rate
  limiting; changing the password did not invalidate the active session.
- **Fix:** `validatePasswordStrength` is enforced on setup and password change
  (≥8 chars, at least one letter and one digit). Login is throttled per
  username: 5 failures in a 5-minute window lock the account for 60 seconds.
  Successful login / password change resets the counters. Password change
  invalidates the current session.
- **Residual:** throttling state is in memory and resets on app restart; a
  determined attacker with many distinct usernames can still spread attempts, but
  the app only ever has a single admin account.

### 5. IPC abuse from untrusted renderer content (FIXED - M)

- **Scenario:** if an XSS ever slipped through, the renderer could call any IPC
  handler (many require auth, but some do not).
- **Fix:** every `ipcMain.handle` now also validates that `event.senderFrame` is
  the main frame of a known app window. Combined with CSP, `contextIsolation`
  and `sandbox`, a sub-frame or foreign webContents cannot invoke handlers.
- **Residual:** none known beyond the existing CSP.

### 6. Arbitrary path opening (FIXED - M)

- **Scenario:** the admin UI's "open folder" feature previously passed any path
  to `shell.openPath`, which is limited by OS to user-willingly-opened files but
  still a footgun. The settings page also reported the legacy AppData paths
  instead of the real `%PROGRAMDATA%` locations, which misled admins about where
  backups/logs live.
- **Fix:** `openPath` now only allows paths inside the app's own data dirs
  (`%APPDATA%\opac-library-system` or `%PROGRAMDATA%\OpacLibrarySystem`);
  reported paths point to the real system dirs.

### 7. LAN sniffing of catalog traffic (ACCEPTED RISK)

- **Scenario:** HTTP + bearer token on the LAN; a sniffer sees token, queries,
  and responses.
- **Assessment:** acceptable for a library OPAC on a trusted LAN. Every endpoint
  (including `/health`, `/library`, `/covers`) requires the token; CORS is
  disabled; a global 200 req/min rate limit applies. Bigger deployments should
  move the API behind a reverse proxy that terminates TLS and add per-client
  limits.
- **Residual:** documented in SECURITY.md.

### 8. Supply chain / third-party risk (REVIEWED)

- `npm audit` (full, prod) reports **0 vulnerabilities**.
- Postgres is the pinned `@embedded-postgres` Windows build; it listens
  loopback-only and runs as the app user.
- Installer is unsigned (SmartScreen warning) and there is no auto-update; both
  are documented accepted limitations.

### 9. User edition crash on startup (FIXED - H)

- **Scenario:** User edition booted with `auth`, `images`, `backup`,
  `borrowings`, and `network` services unset (`null`). Admin-only IPC
  registrars called `requireService(...)` at registration time, which threw as
  soon as `registerAllIpc` ran, so a User install showed no window and crashed
  with an unhandled rejection.
- **Fix:** `registerAllIpc` now registers each admin-only registrar only when
  its backing service exists. User-mode channels that do not apply are simply
  not registered. Verified: User edition boots to "application started",
  mode user.
- **Residual:** none.

### 10. Stale/incompatible legacy cluster blocks startup (PARTIAL)

- **Scenario:** a machine whose `%PROGRAMDATA%\OpacLibrarySystem\database\pgdata`
  was created by an older developer schema (e.g. `categories` lacking the
  current columns, `schema_migrations` without the `name` column) fails
  migration and could not boot.
- **Fix (in part):** `ensureMigrationTable` now back-fills
  `schema_migrations` columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  so migration-tracking upgrades in place (verified against a real stale
  cluster — the previous 42703 no longer occurs). Bootstrap failures now
  surface a clear error dialog instead of a silent hang.
- **Residual:** divergent *application* tables from pre-1.0 developer builds
  are not auto-reconciled; such a cluster still fails startup with a dialog.
  A fresh install or an in-schema upgrade path is required. No 1.0 released
  build precedes this schema, so no shipped upgrade is affected.

### 11. Missing HTTP response hardening headers (FIXED - L)

- **Scenario:** the LAN API responses carried no security headers.
- **Fix:** every API response now sets `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: default-src 'none'`, and `Cache-Control: no-store`.
- **Residual:** none.

## Data flow notes

- User edition never stores catalog data; it holds only the encrypted connection
  config and proxies covers through `opac-img://`.
- Backups are plain on disk (`%PROGRAMDATA%` backups dir) and can be exfiltrated
  by anything with local read rights; they already contain the DB contents, so
  their confidentiality class is that of the catalog (medium).

## Deviations worth revisiting

- Rotate the bearer token periodically; tokens are stored as SHA-256 hash of the
  256-bit random value — there is no expiry/rotation policy today.
- Consider per-client credential/rate limits for public terminals instead of a
  shared bearer token.
- Consider persistent, restart-resistant lockout (e.g., in the DB) for the single
  admin account.
- Code-sign the installer and enable a signed auto-update channel before
  distributing to non-technical libraries.