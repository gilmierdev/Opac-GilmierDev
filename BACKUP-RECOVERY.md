# Backup & Recovery

How the OPAC Library System creates, validates, and restores backups, and what
to do when things go wrong.

## Formats

- A backup is a **folder** named `opac-backup-YYYYMMDD-HHMMSS.opacbk` under
  `%PROGRAMDATA%\OpacLibrarySystem\backups`.
- Contents: `manifest.json` (format `opac-library-backup`, version 1, schema
  version, library name, timestamps), `data.json` (catalog tables), and
  `covers/` (referenced book cover images).
- Tables backed up: authors, categories, publishers, books, admin_users,
  borrowings, settings, schema_migrations.

## Creating backups

- Settings -> Backup & Restore -> **Create Backup**. Do this regularly
  (weekly is a sensible baseline for a small library) and especially before
  any restore, OS upgrade, or app upgrade.
- Copy the folder off-device (USB drive, cloud) as the primary DR copy.

## Restoring backups

- A restore is **destructive**: the current catalog is replaced. The app first
  writes a `pre-restore-*.opacbk` safety snapshot, visible in the backups
  list, so you can always step back.
- Two restore paths: pick from the backups list, or **Restore from File…**
  (choose any `.opacbk` folder via the OS dialog).
- What gets restored: all tables listed above **including** `settings`
  (library name, admin password hash, API token hash) and `admin_users`.
  Consequences to know before you restore an old backup:
  - **The admin password and LAN API token are reset to the values from that
    backup.** The admin password applies *immediately*; the previously
    configured Windows-side connection tokens on User machines will fail and
    must be re-entered.
  - Pre-restore copies of covers are placed in the backups folder but are not
    auto-readded; restore of `covers/` overwrites current cover files.

## Validation and safety (enforced by the code)

1. Manifest must match format/version; a backup requiring a **newer** schema
   than the running build is rejected.
2. Row values must be scalar (string/number/boolean/null).
3. Every column is validated against `information_schema.columns` of the live
   database before any SQL runs — crafted backups cannot inject SQL.
4. Replace happens inside a single transaction that rolls back on error.
5. Restore to a folder you selected is blocked unless it parses as a valid
   backup.

## Recovery scenarios

| Situation | Action |
|---|---|
| Wrong/suspect restore | Restore the newest `pre-restore-*.opacbk` snapshot, then change the admin password and regenerate the API token (INCIDENT-RESPONSE.md). |
| Catalog file corruption / lost data | Restore the newest good backup folder, then update covers if missing. |
| Upgrade refuses to start (schema mismatch) | See DEPLOYMENT-SECURITY.md "Upgrades": back up via the old build, reinstall, restore. |
| Backups folder lost | Data loss. Rebuild from a User edition crawl or manual re-entry; keep off-site copies to avoid this. |
| Credentials key mismatch (DPAPI) | See INCIDENT-RESPONSE.md — the app errors clearly instead of leaking/rotating secrets. Re-enter credentials after restoring the same Windows account/machine. |

## Testing

Run the smoke suite (`npm run smoke`) which provisions a fresh cluster and
round-trips backup -> restore -> verify. For a live sanity check: create a
backup, restore it, and confirm the catalog matches.