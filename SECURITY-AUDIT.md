# OPAC Library System — Website Security Audit & Final Release Report

**Project:** `opac-library-system` v1.0.0 — Electron 44 / React 19 / TypeScript
desktop app; Admin edition (embedded PostgreSQL 18 + Fastify LAN API) and User
edition (read-only catalog client).
**Audit date:** 21 September 2026.
**Method:** source inspection, static patterns (secrets/CSS), runtime testing
(boot both editions, embedded-Postgres smoke test, in-place upgrade check),
dependency audit (`npm audit` full + prod), git-history secret scan.

---

## A. Executive Summary

The application is in **good release condition**. It is a local-first system
with strong main-process boundaries (sandboxed renderer, context isolation,
sender-validated IPCs, auth-gated admin handlers) and sane local-data hardening
(DPAPI-encrypted secrets, SCRAM-only Postgres, least-privilege role,
parameterized queries, hardened backup restore).

**Highlights**
- `npm audit` (full and prod) — **0 vulnerabilities**; `npm run typecheck` and
  `npm run build` pass; full `npm run smoke` (provision → migrate → backup →
  restore → auth round-trip → graceful shutdown) passes.
- No environment/credential files tracked; no secrets found in git history.
- Renderer is XSS-safe by construction (React-text rendering only; no
  `dangerouslySetInnerHTML`/`innerHTML`/`eval`; strict CSP; hash router).
- Hand-mediated fixes during this audit: **User-edition startup crash** (H),
  **legacy-cluster migration-tracker upgrade** (M), **`will-navigate`
  hardening** (M), **LAN API security headers** (L), and **fail-loud bootstrap
  error dialog** (M). All verified after the fix (typecheck/build/smoke/boot).

**Blocking issues for release:** none discovered.
**Recommended before broad distribution:** code-sign the installer and add an
auto-update channel (both documented limitations, not code defects).

---

## B. Scope & Methodology

| Area | Method | Result |
|---|---|---|
| Dependencies | `npm audit` (full + `--omit=dev`) | 0 vulnerabilities |
| Type safety | `npm run typecheck` (node + web) | pass |
| Build | `npm run build` (main/preload/renderer) | pass |
| Runtime E2E | `npm run smoke` (embedded PG 18, alt port) | all passed |
| User edition | launched headed, `OPAC_MODE=user` | boots ("application started") |
| Admin boot | against pre-existing cluster (ProgramData pgdata) | migration-tracker fix verified; old-schema cluster correctly refused with dialog |
| Secrets scan | `git log -p` + working tree grep for `.env`, keys, PEMs, credentials | none present |
| Renderer hardening | grep for DOM/JS sinks; CSP review | no raw-HTML sinks |
| Code review | all IPC handlers, services, repos, provisioner, backup, crypto, API server, renderer store/pages | see findings |

Sandbox note: `rg` was unavailable; searches used PowerShell/`Select-String`
(or built-in tools). Destructive tests were avoided; the stale
`%PROGRAMDATA%` cluster was treated as live data and only read where safe
(schema probe) plus the additive migration-tracker back-fill.

---

## C. Asset, Data & Technology Review

Covered in detail in PRIVACY-DATA-MAP.md and THREAT_MODEL.md. Summary:

- **Assets:** admin credential/session, LAN bearer token (+hash), PG
  credentials, catalog, covers, backups, settings, client connection config.
- **Trust levels:** untrusted LAN (T0) → sandboxed renderer (T1) → trusted
  main process (T2) → local processes (T3) → owner (T4).
- **Technology:** Electron 44.4.3, React 19.3, TS 5.9.3, Fastify 5
  (+ `@fastify/rate-limit`), `pg`, `bcryptjs`, `@embedded-postgres` (PG 18.4),
  better-sqlite3 (legacy migration), electron-vite 5, electron-builder NSIS.

---

## D. Key Mitigations Already In Place

1. **Renderer isolation:** `contextIsolation`, `sandbox`, no `nodeIntegration`,
   `webSecurity`, single typed `window.api` bridge, `{ ok, data | error }`
   envelope, sender/main-frame validation on every IPC.
2. **CSP (index.html):** `default-src 'self'; script-src 'self';
   style-src 'self' 'unsafe-inline'; img-src 'self' data: opac-img: blob:;
   font-src 'self' data:; connect-src 'self' ws: http://localhost:*
   file:; object-src 'none'; base-uri 'self'; frame-src 'none';
   form-action 'self'`.
3. **Auth:** bcrypt cost 12; 12-hour in-memory session; per-username throttle
   (5 fails/5 min → 60 s lockout); session invalidated on password change;
   strength policy (≥8, letter+digit); identical "Invalid username/password".
4. **LAN API:** token-gated on every endpoint, SHAlled token at rest (SHA-256),
   constant-time hash comparison, global 200 req/min, no CORS, 1 MB body cap,
   security/cache headers now set on every response (this audit).
5. **Secrets at rest:** DPAPI (`safeStorage`) for PG passwords and client
   tokens; `credentials.json` `chmod 0600`; refused (not silent) decrypt on
   key mismatch; legacy plaintext auto-upgraded.
6. **PostgreSQL:** loopback-only, SCRAM-SHA-256 only (no `trust`), least-
   privilege `opac` role, parameterized queries, random passwords.
7. **Uploads:** extension + magic-byte validation, 12 MB cap, UUID names,
   strict no-traversal image path resolution.
8. **Backup/restore:** whitelisted tables; per-column whitelist vs live schema
   (blocks SQL injection from crafted backups); scalar-only values; transaction
   with rollback; schema-version guard; pre-restore safety snapshot;
   path-traversal-safe basenames (covers + backups).
9. **Navigation:** `setWindowOpenHandler` deny-all; `will-navigate` now allows
   only the exact renderer entry URL (this audit).

---

## E. Security Findings

Severity scale: **High / Medium / Low / Informational**. All findings verified.

| ID | Severity | Category | Location | Problem | Risk | Status |
|---|---|---|---|---|---|---|
| F-01 | **High** | Availability | `electron/ipc/index.ts`, auth/borrowings/backup/images/network ipc registrars | User edition crashed at startup: admin-only registrars invoked `requireService()` on `null` services during registration (unhandled rejection, no window) | Whole User product unusable | **FIXED** — `registerAllIpc` guards each registrar on service availability. Verified: User boots ("application started", mode user) |
| F-02 | **Medium** | Access control / upgrade | `electron/database/pg/migrations.ts` | `CREATE TABLE IF NOT EXISTS schema_migrations` did not back-fill columns on a pre-existing legacy tracker table → `42703 undefined_column` on `INSERT ... (version, name)` | Upgrade path (older dev clusters) fails start | **FIXED** — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS name/applied_at`. Verified: the 42703 no longer occurs against the stale cluster |
| F-03 | **Medium** | Client-side navigation | `electron/main.ts` `will-navigate` | Production allowed ANY `file:` URL to navigate (preload would re-run in an arbitrary local file) | Defence-in-depth of renderer trust | **FIXED** — only the exact renderer entry URL allowed (hash routing unaffected). |
| F-04 | **Low** | HTTP hardening | `electron/api/server.ts` | LAN API responses carried no security headers | Browser-cache/sniffing of API JSON; MIME-sniffing | **FIXED** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `CSP default-src 'none'`, `Cache-Control: no-store` on every response |
| F-05 | **Medium** | Availability / UX | `electron/main.ts` bootstrap | Any boot failure (DB conflict, schema mismatch) showed no window and silently hung | Admin can't tell why app won't start | **FIXED** — try/catch → error dialog + log + exit(1). Verified via regression boot |
| F-06 | **Low** | N/A (env) | `%PROGRAMDATA%` pgdata | Pre-existing cluster from an older developer schema occupies port 54321 and is incompatible with current schema | Blocks new build boot while the older build is running | **NOTED** — do not run old and new builds on the same machine; back up via old build, reinstall, restore (DEPLOYMENT-SECURITY.md "Upgrades") |
| F-07 | **Info** | Accepted risk | `electron/api/server.ts` | API is cleartext HTTP on the LAN; bearer token visible to packet capture | Sniffing of catalog + token | **ACCEPTED** — documented (SECURITY.md); use TLS reverse proxy for untrusted LANs |
| F-08 | **Info** | Accepted risk | firewall guidance | API traffic must be allowed manually via `netsh` (Private profile only) | User error could expose on Public profile | **ACCEPTED** — generated command is scoped `profile=private`; docs warn |
| F-09 | **Info** | Accepted risk | backup restore | Restoring an old backup also reverts admin password + API token hashes | Temporary credential surprise and lock-out of User clients with old token | **ACCEPTED + DOCUMENTED** — BACKUP-RECOVERY.md recovery steps provide rotation guidance |
| F-10 | **Info** | Accepted risk | `auth.service` throttle | Login lockout is per-process (in-memory) and resets on restart; `changePassword` has no failed-attempt counter | Brute force only during a single process run for one account name | **ACCEPTED** — single-admin design; documented |
| F-11 | **Info** | Accepted risk | `CSP connect-src` | `ws:` + `http://localhost:*` present for dev/HMR; production renderer performs no direct HTTP fetch | Minor widening of CSP in prod | **ACCEPTED** — no remote content; kept to avoid breaking dev tooling; noted for tightening |
| F-12 | **Info** | Accepted risk | restore size | Backup `data.json` is read fully into memory during restore (admin-only path) | Memory pressure on very large catalogs | **ACCEPTED** — admin-gated; documented |

No High-severity issues remain open. No secrets, `.env`, keys, or credentials
exist in the repository or git history.

---

## F. Final Security Score / Verdict

| Dimension | Grade | Notes |
|---|---|---|
| Renderer XSS / client integrity | **A** | No raw-HTML sinks; strict CSP; sandbox |
| Local data confidentiality | **A** | DPAPI + `0600`; refuse-on-mismatch |
| AuthN / AuthZ | **A** | bcrypt-12, throttle, session invalidation, main-process gating |
| Network exposure | **B+** | Token + rate limit + headers; cleartext HTTP is the sole structural gap |
| Resilience / upgrade path | **B** | Migration tracker upgrade fixed; divergent pre-1.0 schemas require manual path |
| Supply chain | **A** | 0 known vulnerabilities |
| Operability | **B** | Fail-loud dialogs; docs added |

**Verdict: APPROVED for release** with the caveats noted (cleartext LAN HTTP,
unsigned installer, no auto-update, one-account brute-force residual).

---

## G. Release Readiness

- [x] Typecheck / build / smoke E2E pass (fresh cluster).
- [x] `npm audit` 0/0 (prod + dev).
- [x] Both editions boot.
- [ ] (Deferred) Code signing for SmartScreen — assign an owner.
- [ ] (Deferred) Auto-update channel — roadmap item.
- [ ] (Ops) Remove/clarify any pre-1.0 dev cluster before production rollout
      (see F-06).

---

## H. Remediation / Roadmap (non-blocking)

1. **HTTPS for the LAN API** behind a TLS reverse proxy (documented.
   Recommend per-client rate limiting via proxy for public terminals).
2. **Persistent lockout** for the admin account (store counters in PG instead
   of memory) to survive restarts.
3. **Token rotation policy + expiry**, or per-client keys for public kiosks.
4. **Code-signing** + **signed updater** before non-technical distribution.
5. **Backup size guard** (e.g., reject `data.json` > 100 MB) and async restore
   progress UI.
6. Predictable **upgrade bridge** for any future divergent schema (documented
   manual path today).

---

## I. Priorities / Severity-Mapped Plan

- **Now (done this audit):** F-01..F-05 (all fixed + verified).
- **Before wide rollout:** TLS termination guidance (F-07), code signing (H4).
- **Next release(s):** persistent lockout (H2), token rotation/expiry (H3).
- **Ongoing:** periodic `npm audit`; rerun SECURITY-CHECKLIST.md; update
  THREAT_MODEL.md/SECURITY-AUDIT.md on any data-flow or trust-boundary change.

---

## J. Overall Conclusion

The OPAC Library System v1.0.0 is a well-hardened, local-first application
suitable for release to a library LAN. The five issues found and fixed during
this audit (including a complete User-edition startup blocker) were verified by
re-running typecheck, build, the embedded-PostgreSQL smoke itinerary, and both
edition boots. Residual risks are confined to the accepted cleartext-HTTP
LAN design, per-process brute-force limits, and the absence of code signing /
auto-update — none of which block a trusted-LAN rollout, and all of which have
documented mitigations or a roadmap item.

*Audited by an automated agent against the project security checklist. This
document is a technical assessment, not legal advice or a compliance
certification.*