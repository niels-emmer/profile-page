# Architecture

A map of the system: how a request flows, where state lives, and where to add
code. Read this before making a structural change.

## Overview

`profile-page` is a **server-rendered, single-user** link-in-bio app:

- One small Node process (Hono) serving HTML, one CSS file per surface, and a
  little progressive-enhancement JS.
- One SQLite database (`node:sqlite`) plus an uploads directory.
- No build step, no frontend framework, two runtime dependencies.
- Deployed as a hardened container behind a TLS-terminating reverse proxy.

## Runtime topology

```
Browser ──HTTPS──▶ reverse proxy ──proxy-net──▶ profile-page:3000
                                                   │
                                     ┌─────────────┴─────────────┐
                                     │  node src/server.ts        │
                                     │  ├─ ./data/profile.db      │
                                     │  └─ ./data/uploads/        │
                                     └────────────────────────────┘
```

The container publishes **no host port**; the proxy reaches it by container name
on the external network named in `PROXY_NETWORK` (default `proxy-net`).

## Source map

```
src/
  server.ts     bootstrap: loadConfig → openDatabase → ensureSeeded → ensureAuth → createApp → serve
  app.ts        createApp(deps) factory — all routes, security headers, auth guard, static assets
  config.ts     env parsing (PORT, DATA_DIR, ADMIN_PASSWORD, SESSION_SECRET, SECURE_COOKIES, BASE_URL)
  db.ts         schema + queries (profile, links, settings, auth) + ensureSeeded
  defaults.ts   DEFAULT_PROFILE / DEFAULT_BACKGROUND / DEFAULT_THEME / DEFAULT_LINKS / DEFAULT_SEED
  types.ts      domain types: Profile, Link, NewLink, ThemeSettings, BackgroundSettings, ThemeMode, SeedFile
  auth.ts       scrypt hashing, HMAC session tokens, CSRF, RateLimiter, ensureAuth, isDefaultPassword
  validate.ts   shared input validation (URLs, asset refs, enums, hex colours, opacity)
  render.ts     renderProfilePage, renderLoginPage, renderSetPasswordPage, renderAdminPage, discovery files,
                escapeHtml, sanitizeCss, backgroundValue (per-theme layered background)
  qr.ts         dependency-free QR Code encoder (byte mode, level M) → module matrix + SVG path
  colors.ts     COLOR_SCHEMES presets, readableTextColor, shade, generateGradient
  upload.ts     detectImageType (magic bytes), saveImage, deleteUpload, isSvg, sanitizeSvg
  tar.ts        dependency-free ustar reader/writer
  backup.ts     buildBackup / restoreBackup
  seed-file.ts  parseSeed / validateSeed / applySeed
  seed.ts       CLI: `node src/seed.ts [seed.json]`
  reset-password.ts CLI: `node src/reset-password.ts [new-password]` — resets the admin password (default `changeme`) and rotates the session secret
public/
  css/style.css      public page (reimplements the LinkStack/Skeleton look)
  css/admin.css      admin UI (shadcn-inspired dark theme, hand-written)
  css/fontawesome.css Font Awesome Free 6.7.1 (full set)
  js/admin.js        progressive enhancement (presets, confirm, avatar preview, sliders, drag reorder,
                     icon-type toggle, icon upload, OG-card generation)
  js/theme.js        visitor theme switcher (loaded synchronously in <head> when enabled)
  js/qr.js           QR modal enhancement (focus handling and Escape)
  icons/*.svg        bundled Simple Icons (white fill)
  fonts/             Inter + Font Awesome woff2
  default-avatar.svg, favicon.png
tests/               node:test suite (helpers in helpers.ts)
docs/                this library + API.md, DEPLOYMENT.md, THIRD-PARTY.md, PLAN.md
SECURITY.md          threat model and controls (repo root — GitHub only detects it there)
```

## Request lifecycle

`createApp(deps)` returns a Hono app. Middleware runs in registration order:

1. **Security headers** on `*` — CSP, `X-Content-Type-Options`, `X-Frame-Options`,
   `Referrer-Policy`, `Permissions-Policy`, and HSTS when secure cookies are on.
2. **`authGuard`** on `/admin` and `/admin/*` — redirects to `/login` before any
   body is read.
3. **Route handlers** — public pages, discovery files, auth, admin, backup.
4. **Static assets** — `/assets/uploads/*` (from `DATA_DIR`) first, then
   `/assets/*` (from `public/`).

`src/server.ts` is a thin bootstrap: it wires the pieces and calls
`@hono/node-server`'s `serve`. Everything testable lives in `createApp` so tests
can boot an app against a throwaway database.

## Data model

Four tables (`src/db.ts`):

| Table | Shape | Notes |
|---|---|---|
| `profile` | single row, `id = 1` | name, tagline, description, avatar_path |
| `links` | one row per link | ordered by `position`; colours stored per link |
| `settings` | key/value | **all theme state** under `theme.*` keys |
| `auth` | single row, `id = 1` | password hash + salt, session secret |

**Theme state is a key/value bag**, e.g. `theme.backgroundDark`,
`theme.defaultMode`, `theme.backgroundImageDark.imagePath`,
`theme.backgroundImageDark.opacity`, `theme.ogImagePath`. This is why new theme
settings need no migration (see
[invariants.md](invariants.md#9-theme-settings-use-the-keyvalue-table--no-migration)).

**Seeding.** `ensureSeeded` applies `DEFAULT_SEED` (the "Alex Rivera" demo) only
when no profile row exists. It is idempotent — later edits, including deleting
every link, survive restarts.

## Rendering

`src/render.ts` owns all HTML generation as template literals. It has no database
access — it receives plain objects and returns strings. Every interpolated value
passes through `escapeHtml`; every CSS value through `sanitizeCss`.

- **`renderProfilePage`** — the public page: profile, links, discovery meta
  (`canonical`, `theme-color`, schema.org `Person` JSON-LD, `rel="me"`,
  `rel="alternate"`), a per-request `<style>` block for the theme, the
  avatar-triggered QR modal (an inline SVG built by `qr.ts`), and the visitor
  switcher when enabled.
- **`renderLoginPage`** — the password form (sets the CSRF cookie).
- **`renderAdminPage`** — the editor: nav, profile, theme, avatar, preview,
  favicon, background, links, backup/restore, security.
- **Discovery files** — `renderRobotsTxt`, `renderSitemap`, `renderLlmsTxt`, and
  `src/contact.ts` for `contact.vcf` / `contact.json` / WebFinger.

## Authentication and sessions

- `ensureAuth` (in `auth.ts`, called at boot): a fresh install starts with the
  bootstrap password `changeme` (no `ADMIN_PASSWORD` env var by default). If
  `ADMIN_PASSWORD` is set it wins and re-hashes when it changes — a legacy
  override, not the normal flow. Changing the password rotates the session
  secret, invalidating sessions.
- The first visit to `/admin` while the password is still `changeme` is
  redirected to `/admin/set-password`, which forces a secure password before
  anything else can be edited.
- The admin can change the password from the **Security** section
  (`POST /admin/password`): it verifies the current password, requires 8+
  characters, rotates the session secret (signing out every other session), and
  re-issues the current session so the user stays logged in. When
  `ADMIN_PASSWORD` is set, the UI notes that the environment value wins on
  restart.
- Forgot the password? `node src/reset-password.ts [new-password]` resets it
  (default `changeme`) and rotates the session secret; in the container:
  `docker exec -it profile-page node src/reset-password.ts`.
- Sessions are **stateless** HMAC-SHA256 tokens (`<expiry-ms>.<hmac>`), 7-day TTL,
  in an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie.
- Every state-changing POST uses a **double-submit CSRF cookie**.
- Login is **rate-limited** (5 / 15 min per client IP; the IP is the *last*
  `X-Forwarded-For` entry).

Full threat model: [SECURITY.md](../../SECURITY.md).

## Uploads

`saveImage(bytes, dir, maxBytes)`:
1. `detectImageType` checks **magic bytes** (JPEG/PNG/WebP only).
2. Size cap (5 MB default; 8 MB for backgrounds).
3. Writes a **random 16-byte hex filename** — the client filename is never used.

`deleteUpload` removes a file only when it lives under `/assets/uploads/` with a
plain basename, so bundled assets are never touched.

The **social preview image** (`theme.ogImagePath`, the 1200×630 card emitted as
`og:image`/`twitter:image`) is generated in the browser: `admin.js` renders the
profile card on a `<canvas>` and uploads the PNG through the same
`saveImage`/`deleteUpload` pipeline (invariant 12 — no server-side codec).

## Backup and restore

`GET /admin/backup` streams a `.tar.gz` (`seed.json` + every file in `uploads/`)
built by the dependency-free `src/tar.ts`. `POST /admin/restore` parses it in
full, validates everything, then writes. Caps, traversal/symlink rejection, and
SVG sanitisation are documented in [API.md](../API.md#backup-archive-format).

## Theme and background composition

Each theme slot (dark/light) has a base (`backgroundDark`/`backgroundLight`, a
CSS colour or gradient) and a `BackgroundSettings` object. `backgroundValue()`
composes the final CSS `background`:

- No image → the solid `color` if set, else the base.
- Image, full opacity → `url(...) <placement>, <behind>`.
- Image, `opacity < 100` → a translucent **veil** of `color` is drawn over the
  image: `linear-gradient(rgba(r,g,b,1-opacity), …), url(...), color`.

CSS cannot set the opacity of a `background-image`, so the veil is how a faded
image over a solid colour is achieved. See
[decisions.md](decisions.md#adr-010-background-image-opacity-via-a-colour-veil).

## Extension points

**Add a route** — register it in `src/app.ts`. Put any rendering in `render.ts`,
any data access in `db.ts`, any validation in `validate.ts`.

**Add a theme setting** — add it to `ThemeSettings` (`types.ts`) and a default in
`defaults.ts`; read/write it in `getTheme`/`saveTheme`; expose it in the admin
form; add it to `normalizeTheme` in `seed-file.ts`. No migration needed.

**Add an admin section** — add a `<section id="…" class="admin-card">` in
`renderAdminPage`, a matching nav link, and (if it saves) a route. Reuse the
existing card / field / subsection / button classes (see
[ui-guidelines.md](ui-guidelines.md)).

**Add client behaviour** — an external file in `public/js/`, loaded from
`render.ts`. No inline scripts (invariant 8).

## Layering rules

| Layer | File(s) | Must not |
|---|---|---|
| HTTP / routing | `app.ts` | build HTML strings or SQL |
| Rendering | `render.ts` | touch the database or the request |
| Data access | `db.ts` | know about HTTP or HTML |
| Validation | `validate.ts` | depend on anything else in `src/` |
| Domain types | `types.ts` | contain logic |
| Styling | `public/css/*` | require JS to lay out |

Keeping these seams clean is what makes the app testable without a server.
