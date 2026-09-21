# Privacy & Data Map

Where OPAC Library System stores data, what confidentiality class it gets,
and retention notes. This is a documentation of facts, not a statement of
legal compliance (GDPR/PRIVACY comparisons are left to the operator).

## Data inventory

| Data | Location | Content | Confidentiality | At-rest protection |
|---|---|---|---|---|
| Catalog | PostgreSQL `opac` DB, `%PROGRAMDATA%\OpacLibrarySystem\database\pgdata` | books, authors, categories, publishers, borrowings (borrower name/ID, dates), reviews/notes | medium | filesystem ACLs (`chmod 0600` creds roles; DB data plaintext on disk) |
| Admin account | PostgreSQL `admin_users` | username, bcrypt hash (cost 12), name | high | bcrypt-only hash |
| Settings | PostgreSQL `settings` | library name/address/contact, theme, **API token SHA-256 hash**, token metadata | high (token hash) / low (rest) | plaintext rows; token is hashed |
| PG credentials | `%PROGRAMDATA%\OpacLibrarySystem\database\credentials.json` | random superuser + app passwords | high | DPAPI (`safeStorage`), `chmod 0600` |
| Client connection | `%APPDATA%\opac-library-system\connection.json` (User edition) | admin-configured host, port, and **bearer token** | high | token DPAPI-encrypted (`enc:` marker) |
| Cover images / logos | `%PROGRAMDATA%\OpacLibrarySystem\book-covers` | uploaded JPG/PNG/WEBP (magic-byte validated, <= 12 MB) | medium | filesystem ACLs |
| Backups | `%PROGRAMDATA%\OpacLibrarySystem\backups` | full catalog snapshot incl. admin hash + token hash | high | plaintext on disk — protect like the DB |
| Logs | `%PROGRAMDATA%\OpacLibrarySystem\logs\app.log` | boot/restore/auth events; secrets redacted in code | low-med | plaintext |

## What the user edition does NOT store

- No catalog data is written to a User machine; it only caches the connection
  config (encrypted token) and buffers covers in memory through `opac-img://`.
- No telemetry, analytics, or crash reporting is built in.

## Network exposure summary

- LAN API: bearer-token Fastify over HTTP on the configured port (default
  47821). Every request includes the token; responses carry no-cache/security
  headers. Traffic visible to LAN packet capture (see SECURITY.md).
- Postgres: loopback-only (127.0.0.1), SCRAM-SHA-256, never exposed.
- Nothing listens on the internet; no inbound ports are opened automatically
  (admin must create the firewall rule).

## Retention & deletion

- The app has no automatic retention/expiry. Deleting data = deleting rows,
  deleting backups, or uninstalling (which does not erase
  `%PROGRAMDATA%\OpacLibrarySystem` by default).
- To fully remove client-side secrets: on the User machine, reset the
  connection (Settings/Connect -> Reset), which deletes `connection.json`.
- To fully remove server-side data: uninstall the app and delete
  `%PROGRAMDATA%\OpacLibrarySystem` (keep backups first).

## Operator guidance (not legal advice)

- If applicable privacy law applies to borrower names, treat borrowings as
  personal data: minimize the fields collected (`borrower_id` is optional),
  protect backups/DB ACLs, and define a retention policy for `borrowings`
  (e.g., purge returned records after a fixed period).
- Contact info entered in Settings (phone/email) is displayed by user-facing
  screens; keep it minimal and accurate.