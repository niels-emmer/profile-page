# Security

`profile-page` is a single-user, self-hosted app. The public page is meant to be
world-readable; everything under `/admin` is private. This document describes the
threat model, the controls in place, and the risks that are knowingly accepted.

## Threat model

| Asset | Exposure | Protection |
|---|---|---|
| Public profile content | Internet | None needed — it is public by design |
| Admin editor (`/admin`) | Internet | Password login + signed session cookie |
| SQLite database + uploads | Local disk only | Gitignored, never served except `/assets/uploads/*` |
| Admin password / session secret | Environment / database | Never committed; `.env` gitignored |

The app assumes it runs behind a TLS-terminating reverse proxy on a private
network, with no published ports. It does not implement TLS itself.

## Authentication

- **Password hashing** — `scrypt` via `node:crypto`, 64-byte derived key, a fresh
  16-byte random salt per install. Verification uses `timingSafeEqual`.
- **Sessions** — stateless HMAC-SHA256 tokens (`<expiry-ms>.<hmac>`), 7-day TTL.
  The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `SECURE_COOKIES` is
  on (default in production). Changing the password rotates the session secret,
  invalidating all existing sessions.
- **Rate limiting** — 5 failed logins per 15 minutes per client IP. The client IP
  is taken from the **last** `X-Forwarded-For` entry, i.e. the address appended by
  the trusted proxy; earlier entries are client-controlled and ignored.
- **CSRF** — double-submit cookie on every state-changing POST, including
  `/logout`. The token is a 32-byte random value in a non-`HttpOnly` cookie,
  echoed in a hidden form field and compared with `timingSafeEqual`.
  `SameSite=Lax` and `form-action 'self'` provide defence in depth.

## Input handling

- **SQL** — every query is parameterised (`?` placeholders). No string-built SQL.
- **HTML** — all interpolated values pass through `escapeHtml`.
- **CSS** — admin-supplied colour/gradient values pass through `sanitizeCss`,
  which strips everything outside `[a-zA-Z0-9#(),.%\s/-]`. This blocks
  `</style>` breakout and `url(...)` payloads. Local background shorthands such as
  `url(/assets/uploads/bg.jpg) center/cover no-repeat fixed` are preserved.
- **URLs** — link URLs must parse as `http:` or `https:` and may not contain
  control characters (CR/LF are stripped by `new URL()`, so they are rejected on
  the raw value). `faviconPath` and image-type `iconValue` must be a local
  `/assets/` path (external URLs are rejected, matching the `img-src 'self'` CSP).
- **Forwarded headers** — absolute URLs (canonical, `og:url`, JSON-LD, sitemap,
  vCard, WebFinger) use `BASE_URL` when set. Otherwise `X-Forwarded-Host` /
  `X-Forwarded-Proto` are used, but only when the host matches a hostname
  pattern; malformed or empty values fall back to the request host. **Set
  `BASE_URL` in production** so forwarded headers are not trusted at all.
- **Seeds** — `src/seed.ts` applies the same URL and asset-path validation as the
  admin routes before writing anything.
- **Backup restore** — an uploaded archive is size-capped (50 MB compressed,
  100 MB decompressed), parsed with a dependency-free tar reader that rejects
  absolute paths, traversal, symlinks, and device nodes, and validated in full
  before anything is written. Uploads must be JPEG/PNG/WebP by magic bytes or an
  SVG, which is stripped of `<script>`, `on*` handlers, and `javascript:` URLs.
- **Uploads** — validated by magic bytes (JPEG, PNG, WebP only), capped at 5 MB
  (8 MB for background images), and written under a random 16-byte hex filename.
  The client filename is never used, so it cannot influence the path. SVG is
  rejected. Replacing or removing a favicon/background deletes the previous file
  only when it lives under `/assets/uploads/` with a plain basename; bundled
  assets are never touched.
- **Background options** — size, position, repeat, and attachment are validated
  against fixed enums, so no user-supplied string reaches the stylesheet.
- **Path traversal** — `/assets/uploads/*` is guarded by an explicit check that
  decodes the path and rejects `..`, NUL, and backslashes, on top of the static
  handler's own guard.

## Response headers

Every response carries:

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self';
  connect-src 'self'; form-action 'self'; frame-ancestors 'none';
  base-uri 'none'; object-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   # when secure cookies are on
```

`style-src 'unsafe-inline'` is required: the public page emits a per-request
`<style>` block for the theme and inline `style` attributes for link colours.
There are no inline scripts — `script-src 'self'` is strict.

## Container hardening

- Runs as the non-root `node` user (uid 1000).
- `read_only: true` root filesystem, with a writable `/data` volume and tmpfs `/tmp`.
- `cap_drop: ALL`, `no-new-privileges: true`.
- No published ports; reachable only on the external network named in
  `PROXY_NETWORK` (default `proxy-net`).
- Healthcheck on `/health`.

## Accepted risks

These are known and deliberate for a single-user personal page:

- **scrypt uses Node's defaults** (N=16384, r=8, p=1), below the OWASP
  recommendation of N=2^17. Acceptable for a single account with a strong password.
- **The generated first-run password is printed once to the logs.** Set
  `ADMIN_PASSWORD` to avoid it. Treat container logs as sensitive.
- **Request bodies are buffered before validation.** `/admin/avatar` and
  `/admin/favicon` are gated by auth first, then a 6 MB `bodyLimit`;
  `/admin/background` has a 9 MB `bodyLimit`; `/login` has a 16 KB `bodyLimit` and
  is additionally rate-limited.
- **No account lockout beyond the IP rate limit.** A distributed attacker with
  many source IPs is not throttled.
- **No audit log.** Single-user app; changes are not recorded.

## Reporting

This is a personal project. If you find a vulnerability, open a private security
advisory on the repository rather than a public issue.
