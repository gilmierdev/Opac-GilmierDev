# Deployment Security Guide

Operational guidance for deploying the OPAC Library System on Windows.

## Installer behavior

- NSIS per-machine installation (`electron-builder.yml`). Data lives in
  `%PROGRAMDATA%\OpacLibrarySystem` (PostgreSQL data dir, creds, backups,
  covers, logs) and survives reinstall/upgrade.
- The installer is **unsigned** out of the box: Windows SmartScreen will warn.
  Sign with a code-signing certificate before distributing to non-technical
  sites, or instruct installers to allow it.
- Per-machine install elevates during setup; the app itself runs with
  standard user rights afterwards.

## First-run

1. Accept the install, then choose a strong admin password (>= 8 chars; at
   least one letter and one digit — 12+ chars recommended).
2. The app provisions an embedded PostgreSQL cluster on `127.0.0.1:54321`
   (override with `OPAC_PG_PORT`, 1024-65535). Credentials are random per
   install, `chmod 0600`, and DPAPI-encrypted.
3. Verify migration succeeded in `%PROGRAMDATA%\OpacLibrarySystem\logs\app.log`.

## Exposing the LAN API safely

1. In **Network** settings: Start Server and note the port (default `47821`).
2. Generate an **Access Token**; copy it immediately (shown once).
3. Allow inbound traffic **on the Private profile only** — the suggested
   `netsh` command is already scoped `profile=private`. Do NOT enable rules on
   the Public profile. Use the command in an elevated terminal.
4. Test from a User computer with the token before deploying en masse.

Notes and constraints:

- The API is **HTTP**, not HTTPS. Anyone on the same LAN with packet capture
  can see the token and responses. Acceptable on a trusted library LAN only;
  for untrusted networks, front the API with a TLS-terminating reverse proxy.
- All endpoints require the bearer token, including `/health`, `/library`,
  `/covers`. There is no CORS (browser clients cannot read responses cross-
  origin; configure a server-side proxy or CORS on the TLS gateway if needed).
- Global rate limit: 200 requests/minute/IP.
- `127.0.0.1:54321` (PostgreSQL) must stay loopback-only and is never exposed.

## Port firewall matrix

| Port | Listener | Purpose | Exposure |
|---|---|---|---|
| 54321 (default) | PostgreSQL | local app DB | loopback only |
| 47821 (default) | Fastify API | LAN catalog access | LAN (Private profile) |

## Upgrades

- New builds read the existing cluster at `%PROGRAMDATA%`. Migration-tracking
  (`schema_migrations`) is upgraded in place; backups must not require a newer
  schema than the running build.
- If a previous installation was built from a *pre-1.0 developer schema*, the
  new build will refuse to start with a clear dialog. Back up the catalog
  through the old build (Settings -> Create Backup), then reinstall fresh and
  restore.
- Users on the LAN must re-enter the connection (host:port:token) only if the
  token was regenerated.

## Backups

- Backups are folders (`...\backups\opac-backup-*.opacbk`) containing
  `manifest.json`, `data.json`, and `covers/`. They are plaintext on disk —
  protect the backups directory the same way you protect the catalog.
- Copy backups off the machine regularly (USB/network share) so they survive
  hardware failure. See BACKUP-RECOVERY.md.