# Security & Release Checklist

Run through this checklist before each release. Items are ordered into
"pre-release (code)", "build & verification", and "on the admin machine".

## Code / pre-release

- [ ] `npm audit` and `npm audit --omit=dev` report **0 vulnerabilities**
      (or all findings have an explicitly documented owner/accepted decision).
- [ ] `npm run typecheck` passes (both `node` and `web` targets).
- [ ] `npm run build` completes without warnings that change behavior.
- [ ] `npm run smoke` passes end-to-end: provision -> migrate -> backup ->
      restore -> admin setup/login -> password change -> logout -> graceful
      PG shutdown. Run with `OPAC_PG_PORT=<unused>` if 54321 is occupied.
- [ ] No `.env`, private key, PEM, or credential files are tracked by git
      (`git ls-files | <search for keys/certs/secrets>`).
- [ ] `.gitignore` covers `out/`, `release/`, `node_modules/`, `*.log`,
      `.smoke-tmp/`, `.smoke-failure.txt`.
- [ ] Renderer does not introduce `dangerouslySetInnerHTML`, `innerHTML`,
      `eval`, or `new Function` (grep the `src/` tree).
- [ ] No new IPC channel is added without: the `{ ok, data | error }`
      envelope, a `requireAuth` decision, and sender validation (automatic via
      `registerIpc`). Shared types in `shared/*` are updated too.
- [ ] New admin-only services remember to be conditionally registered in
      `electron/ipc/index.ts` (guard on the service being non-null) so the
      User edition keeps booting.

## Build & verification

- [ ] Installer artifact builds cleanly (`npm run build:win`) and is signed
      OR the unsigned/SmartScreen limitation is acknowledged.
- [ ] `electron-builder.base.yml` `appId`, product name, and NSIS per-machine target
      are intentional (per-machine install means data in
      `%PROGRAMDATA%\OpacLibrarySystem`).
- [ ] Version bumped; `README` release notes updated (breaking backup/manifest
      changes update `backup.service` FORMAT_VERSION).

## On the admin machine

- [ ] Fresh first-run: set a strong admin password (>= 12 chars, letters +
      digits + symbols is recommended; policy enforces >= 8 + letter + digit).
- [ ] Network tab: generate an API token, apply the Windows Firewall rule
      **only on the Private profile** (the generated command is already
      scoped `profile=private`).
- [ ] Confirm a User computer can connect (status Online, token accepted).
- [ ] Create a first backup and verify Restore to a scratch location works.
- [ ] Confirm `%PROGRAMDATA%\OpacLibrarySystem\logs\app.log` shows no
      `[ERROR]` on normal startup.

## Post-release

- [ ] Record in the release notes: resolved findings, accepted risks, and the
      schema/minimum-version requirements for upgrades.
- [ ] If any secret leaked (token/password), document rotation steps in
      INCIDENT-RESPONSE.md and execute them.