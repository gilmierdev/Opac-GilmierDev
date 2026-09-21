# Incident Response

Immediate, safe actions for the most likely security/operational incidents.
Every runbook: (1) contain, (2) investigate, (3) recover, (4) log the lesson
in the release notes.

## IR-01 — LAN access token compromised

- **Contain:** Network tab -> **Regenerate Token**. Existing User connections
  stop immediately (authenticated by the regenerated token).
- **Investigate:** review `app.log` (respects are logged; check `Connected
  Users` counter on the Network tab for unexpected clients). Check the
  firewall rule is Private-profile only.
- **Recover:** distribute the new token to trusted User machines and update
  each `connection.json` via the Connect screen.
- If regeneration is suspected but not confirmed: regenerate anyway once a
  quarter, per good hygiene.

## IR-02 — Admin password disclosed / brute-force suspected

- **Contain:** change the password in Settings -> Change Password (invalidates
  the active session immediately).
- **Investigate:** `app.log` shows failed logins/lockouts (`login failed`,
  throttling counters). Lacunae: lockout state is per-process, so restarting
  the app resets counters — consider that in your analysis.
- **Recover:** re-enter the new password; remind staff of password policy
  (>= 8 chars, letter + digit).

## IR-03 — Catalog data loss / corruption / bad restore

- **Contain:** do **not** keep restoring blindly. Note the last good state.
- **Recover:** restore the newest `pre-restore-*.opacbk` (created automatically
  before every restore) or the newest good manual backup
  (`BACKUP-RECOVERY.md`). Then update the admin password and regenerate the
  API token (those were reset by the restore).
- Validate: compare book count against `app.log`/a User-edition view.

## IR-04 — DPAPI/`safeStorage` key mismatch (decrypt failure)

- Symptom: errors like `failed to decrypt secret with safeStorage (key
  mismatch?)` or a startup error dialog.
- Cause: the app was moved to a different Windows account or a re-imaged
  machine, so the OS key materially changed.
- **Contain/Recover:** do not delete `credentials.json`/`connection.json`
  manually just to "fix" it unless you are prepared for re-provisioning.
  Preference order:
  1. Restore the previous OS account/profile (same DPAPI key).
  2. Reset the User connection on each client (token re-entry).
  3. For an Admin install: it may require reinstalling the cluster fresh,
     then restoring from a backup. Back up first via any working build.
- The app deliberately refuses to decrypt rather than silently rotating
  secrets, so a mismatch is loud, not silent.

## IR-05 — Malicious or malformed backup file

- **Contain:** do not select/restore untrusted folders. Restore is already
  hardened (column whitelist, scalar-only values, manifest/schema guard,
  transactional rollback), so a bad file fails closed with an error and the
  DB is unchanged.
- **Investigate:** the error message (returned to the admin) and `app.log`
  (`restore failed`). Keep the file for analysis; do not open it with a text
  editor that renders rich content.

## IR-06 — App fails to start (no window, or "Unable to start" dialog)

- Read `%PROGRAMDATA%\OpacLibrarySystem\logs\app.log` tail. Common causes:
  - Another OPAC instance/cluster already holds `127.0.0.1:<port>` (a stale
    process). Close the other instance, or set `OPAC_PG_PORT` to a free port.
  - Legacy/divergent schema cluster (see DEPLOYMENT-SECURITY.md "Upgrades").
  - DPAPI mismatch (IR-04).
- Do not reinstall before backing up the cluster data
  (`%PROGRAMDATA%\OpacLibrarySystem\database\pgdata` + `backups\`).

## Post-incident

- Update this file with a dated entry: what happened, what worked, what
  changed (new findings -> THREAT_MODEL.md, SECURITY-AUDIT.md).
- Rotate the API token and admin password as part of closing the incident.