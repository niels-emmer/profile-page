# Remaining work

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Scaffold (package.json, tsconfig, Dockerfile, compose, .gitignore, .env.example, LICENSE, README) | done |
| 2 | Data layer (SQLite schema, queries, seed) | done |
| 3 | Public page render (CSS, fonts, icons, animations, assets) | done |
| 4 | Auth | done |
| 5 | Admin editor | done |
| 6 | Hardening | done |
| 7 | Tests + docs | done |
| 8 | Personal seed + exact-copy verification | done |

Verified so far: `tsc --noEmit` clean; server boots; `/` and `/health` return 200; all assets return 200.

---

## Phase 4 — Auth

**Files:** `src/auth.ts` (new), `src/server.ts` (edit)

- [x] scrypt password hashing via `node:crypto` (per-install random salt)
- [x] HMAC-SHA256 signed session cookie: 7-day TTL, `HttpOnly`, `SameSite=Lax`, `Secure` when `SECURE_COOKIES=true`
- [x] `ensureAuth()`: `ADMIN_PASSWORD` wins (re-hash if changed); otherwise generate a random password, log it once, persist hash + salt + session secret in the `auth` table
- [x] `RateLimiter`: 5 attempts / 15 min per IP
- [x] Routes: `GET /login`, `POST /login`, `POST /logout`
- [x] `requireAuth` middleware: unauthenticated `/admin` → 302 `/login`
- [x] Verify: correct + wrong password, rate-limit trip, `/admin` redirect

## Phase 5 — Admin editor

**Files:** `src/colors.ts` (new), `src/upload.ts` (new), `src/render.ts` (edit), `src/server.ts` (edit), `public/css/admin.css` (new), `public/js/admin.js` (new)

- [x] `colors.ts`: `COLOR_SCHEMES` (the 7 presets), `readableTextColor`, `shade`, `generateGradient`
- [x] `upload.ts`: `saveImage()` — magic-byte check (JPEG/PNG/WebP), 5 MB cap, random filename
- [x] `render.ts`: `renderLoginPage`, `renderAdminPage` (profile form, theme fields, avatar upload, links CRUD, preset buttons)
- [x] Routes: `POST /admin/profile`, `POST /admin/avatar`, `POST /admin/links`, `POST /admin/links/:id/delete`, `POST /admin/links/reorder`
- [x] CSRF: double-submit cookie on all admin POSTs
- [x] Verify: edit profile, upload avatar, add/edit/delete/reorder links, apply colour presets

## Phase 6 — Hardening

- [x] Security headers middleware: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- [x] `sanitizeCss` on all admin-supplied CSS values (helper already in `render.ts`)
- [x] Validate link URLs (http/https only)
- [x] Upload path-traversal check
- [x] Confirm Docker hardening: non-root, read-only rootfs, `cap_drop`, healthcheck
- [x] Run `@security-auditor`

Audit result: PASSED, no Critical/High. Remediated in this phase:
- Rate limiter now keys on the **last** `X-Forwarded-For` entry (the one appended by
  the trusted proxy) instead of the client-controlled first entry.
- `DATA_DIR=/data` set in the Dockerfile so it matches the compose volume mount.
- `SECURE_COOKIES` defaults to `true` when `NODE_ENV=production`; `.env.example` sets it.
- Password change now rotates the session secret, invalidating old sessions.
- `faviconPath` and image-type `iconValue` restricted to local `/assets/` paths or http(s) URLs.
- `blob:` added to CSP `img-src` (avatar preview); `bodyLimit` (6 MB) on the avatar route.

Accepted (documented, not fixed): scrypt uses Node defaults (N=16384); generated
password is logged once on first run; upload body is buffered before the size cap
(authenticated admin only).

## Phase 7 — Tests + docs

- [x] `tests/`: auth (hash/verify/token/rate-limit), colours, upload validation, routes (login redirect, CSRF reject, CRUD), render fidelity
- [x] `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/API.md`, `docs/THIRD-PARTY.md`
- [x] Finalise README
- [x] Run `@reviewer`

Notes:
- `src/server.ts` split into `src/app.ts` (testable `createApp` factory) + a thin
  `src/server.ts` bootstrap. Shared validation moved to `src/validate.ts`; seed
  loading moved to `src/seed-file.ts`. 49 tests pass via `npm test`.
- **Known gap:** no schema migration. `CREATE TABLE IF NOT EXISTS` does not add
  columns to an existing database, so an older `profile.db` breaks on a schema
  change. Documented in `docs/DEPLOYMENT.md` (reset + re-seed). A lightweight
  `ALTER TABLE ADD COLUMN` migration is a candidate follow-up.

Reviewer findings addressed:
- `/logout` now enforces CSRF (was missing).
- `og:url`/`og:image` honour `X-Forwarded-Proto`/`X-Forwarded-Host` behind the proxy.
- Asset references restricted to local `/assets/` paths, matching the `img-src 'self'` CSP.
- `authGuard` middleware runs before `bodyLimit`; `/login` gained a 16 KB body limit.
- `/admin/profile` validates the favicon before saving; reorder rejects duplicate ids.
- Seed files are validated with the same rules as the admin routes.
- `parsePort` rejects trailing garbage; `SESSION_SECRET` doc wording corrected.
- Tests added for avatar upload, favicon/icon validation, logout CSRF, secret
  rotation, seed parsing/validation/application, and duplicate-id reorder.

## Phase 8 — Personal seed + exact copy

- [x] `data/personal-seed.json` (gitignored) with the extracted personal data
- [x] `personal-seed.example.json` (committed, placeholders)
- [x] `src/seed.ts`: accept an optional seed file argument
- [x] Copy avatar + custom icons into `data/uploads/` (gitignored)
- [x] Verify the rendered page matches the source profile page

### Verification record

Method: headless Chromium (Playwright, system browser) at 1280x1400, dark colour
scheme, full-page screenshots plus a computed-style comparison of every element
against the source page. The saved recon supplied the source values; the live
page supplied the rendered comparison (the recon has no background image).

Result: name, badge, avatar size, description, button count, button order, button
text, hrefs, targets, sizes, colours, borders, and icon sizes all match.

Two fidelity bugs were found and fixed during verification:

1. A global `* { box-sizing: border-box }` made buttons 300x47 instead of the
   source's 324x50 (content-box). Removed; `.container`/`.column` keep their
   explicit `border-box`.
2. The Public Key icon used `fa-key` without a family class, so it stayed inline
   (8px) instead of inline-block (28px). Seed changed to `fa-solid fa-key`.

Intentional deltas (not reproduced):

- **Hidden share-button block.** The source has a `visibility: hidden` share
  button (`.sharediv`, 88px tall) that pushes content down. It is dead markup, so
  it is omitted; content sits 88px higher. Everything below is identical.
- **Solid brand buttons** (LinkedIn, Signal, Matrix) use `background-color` in the
  source and a solid `linear-gradient` here. Rendered pixels are identical.
- **Badge SVG** carries no inline `<style>`; the `.badge` rule lives in
  `style.css`.
- **No BackgroundCheck dynamic contrast** — text colour is fixed (`#ffffff`).
- **No click-tracking, share, or copy-URL scripts.**
- **Meta tags differ** (`og:url`, `twitter:title`) — ours are derived from the
  request/`BASE_URL`.
- **Description** uses regular spaces instead of `&nbsp;`.

---

## Added after Phase 7 — Backup & restore

Admin panel feature (not in the original plan):

- `GET /admin/backup` — streams a `.tar.gz` of `seed.json` (profile, theme,
  links) plus every file in `uploads/`.
- `POST /admin/restore` — validates an uploaded archive in full, then replaces
  the profile, theme, links, and images.
- `src/tar.ts` — dependency-free ustar reader/writer (keeps runtime deps at 2).
- `src/backup.ts` — `buildBackup` / `restoreBackup`.
- `src/upload.ts` — `isSvg` / `sanitizeSvg` for restored SVG icons.
- Validation: 50 MB compressed / 100 MB decompressed caps, traversal/symlink
  rejection, seed validation, magic-byte image checks, SVG script stripping,
  AppleDouble/`.DS_Store` skipping. Nothing is written until all entries pass.
- Verified end-to-end: download → edit → restore round-trip, plus restoring a
  hand-made tarball (AppleDouble junk + a differently-named seed file).

---

## Generalisation for public release

The personal profile data was removed from the repo (it lives only in the
gitignored `data/` directory and in the owner's downloaded backup). In its place:

- `src/defaults.ts` gained `DEFAULT_LINKS` and `DEFAULT_SEED` — a representative
  demo person ("Alex Rivera") with six example links.
- `ensureSeeded` now applies `DEFAULT_SEED` on first run when the database has no
  profile row. It is idempotent and never overwrites existing content.
- The bundled `public/icons/*.svg` were given `fill="#ffffff"` so they render on
  the dark theme's coloured buttons; the demo profile uses them.
- `data/` is empty apart from `.gitkeep`; `personal-seed.example.json` remains the
  committed template.

---

## Status: all phases complete

Phases 1-8 are done and verified. Remaining known gap: no schema migration
(see the Phase 7 note).
