# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **QR code share modal**: clicking the avatar opens a modal with a QR code for
  the page URL, the URL shown as text (without its scheme), and a "Get your own
  profile page" link to the project. The QR is generated server-side by a
  dependency-free encoder (`src/qr.ts`) and drawn as inline SVG; the modal works
  without JavaScript (CSS `:target`), with a small script adding focus handling
  and Escape.
- **Link icon upload**: in the link editor, choosing **Image path** shows an
  **Upload icon** button that resizes/converts the graphic in the browser,
  uploads it, and fills the icon path field. Choosing **Font Awesome** shows a
  lookup link and the icon colour field. Only the fields for the selected icon
  type are shown.

### Changed

- The reverse-proxy Docker network is now configurable via `PROXY_NETWORK` in
  `.env` (default `proxy-net`) instead of being hardcoded in
  `docker-compose.yml` — the quick start no longer assumes a network named
  `proxy-net`.

### Added

- **Bootstrap password flow**: a fresh install starts with the password
  `changeme` and the first visit to `/admin` forces you to pick a secure one
  (`/admin/set-password`). `ADMIN_PASSWORD` is no longer part of the default
  setup — the password is managed from the UI.
- **Password reset script** (`src/reset-password.ts`): reset a forgotten admin
  password from the container (`docker exec -it profile-page node
  src/reset-password.ts`), then restart. Also signs out every session.
- `Cache-Control: no-cache` on `/assets/*` so browsers revalidate JS/CSS after
  a deploy instead of serving a stale `admin.js` (which made new buttons
  silently do nothing).
- The preview-image **Generate** button now shows "Generating…" while it works
  and can never hang on font loading.

### Fixed

- Admin **Preview image** Generate button: the deployed `admin.js` could be
  served from the browser cache after an upgrade, so the button appeared to do
  nothing. Cache revalidation + visible feedback fix this.

### Added

- Admin **Preview image** section: a **Generate** button renders a 1200×630
  social preview card (avatar, name, and tagline on the accent colour) in the
  browser and uploads it; the public page emits it as `og:image` /
  `twitter:image`, falling back to the avatar when unset. A plain file upload is
  the no-JS fallback.
- Admin **Security** section: change the admin password from the UI (min 8
  characters). The session secret is rotated, signing out every other session,
  and the current session is re-issued. Rate-limited per client IP.
- Admin **Theme** section: choose a default of light, dark, or system, and
  optionally let visitors switch the theme themselves.
- Visitor theme switcher: a non-intrusive icon in the bottom-right corner of the
  public page that expands on hover (or tap on mobile) to offer light, dark, and
  system. The choice is remembered in `localStorage`. A forced default applies
  without JavaScript.
- Per-theme background **image opacity** and a solid **background colour** behind
  it (both for the dark and light scheme), so a faded image can sit over a colour.
  The colour also becomes the page background when there is no image.
- A **governance library** under `docs/governance/` — invariants, architecture,
  style guide, UI guidelines, testing, workflow, and locked decisions (ADRs) —
  linked from a new root [`AGENTS.md`](AGENTS.md), so anyone can fork and develop
  in a consistent style.

### Fixed

- Admin colour pickers no longer stretch to the full field width; they render as
  compact swatches inline with their label.
- Added spacing between the background upload and options forms in the admin
  panel.
- Split the admin "Backup & restore" card into clearly labelled **Backup** and
  **Restore** sub-sections, each with its own description and controls.
- Reorganised the admin **Background** section to match the rest of the panel: an
  inline upload/remove row, a responsive grid for the placement selects, and an
  opacity slider — instead of full-width stacked controls.

### Changed

- README: added an "Editing your profile" section documenting the admin panel,
  how to sign in, and how to find Font Awesome icon classes for links.

## [1.0.0] — 2026-09-29

First stable release: a minimal, self-hosted, single-user link-in-bio page.

### Added

- Public profile page at `/` with name, tagline, description, avatar, and link
  buttons.
- Admin editor at `/admin` (password login) with CSRF protection and login rate
  limiting.
- Custom favicon upload/remove — centre-cropped to a 512×512 PNG in the browser,
  with an `apple-touch-icon`.
- Per-theme background images (dark and light) with size, position, repeat, and
  scroll options; uploads are resized and converted to WebP in the browser.
- Drag-to-reorder links (Pointer Events), with Move up/down buttons as the
  no-JS/keyboard fallback.
- One-click backup and restore as a `.tar.gz` (profile, theme, links, and
  uploads).
- Colour presets and solid/gradient buttons with an automatically readable text
  colour.
- Dark and light themes that follow the visitor's OS preference.
- Crawler/agent files: `robots.txt`, `sitemap.xml`, `llms.txt`, a canonical link,
  `theme-color`, and schema.org `Person` JSON-LD.
- Contact exchange: `/contact.vcf` (vCard 4.0), `/contact.json`, and
  `/.well-known/webfinger` (RFC 7033).
- Seed-file support (`node src/seed.ts <file.json>`) and a representative demo
  profile seeded on first run.

### Security

- scrypt password hashing, HMAC-signed HttpOnly `SameSite=Lax` session cookies,
  CSRF double-submit tokens, and a 5/15-minute login rate limiter.
- Strict security headers (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`).
- Upload validation by magic bytes with generated filenames; SVG sanitisation on
  restore.
- Hardened container: non-root, read-only root filesystem, `cap_drop: ALL`,
  `no-new-privileges`, and no published ports.
- Control characters rejected in URLs and asset paths, vCard URIs sanitised, and
  forwarded hosts validated.

### Documentation

- README, `docs/API.md`, `docs/DEPLOYMENT.md`, `SECURITY.md`,
  `docs/THIRD-PARTY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`.

[Unreleased]: https://github.com/niels-emmer/profile-page/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/niels-emmer/profile-page/releases/tag/v1.0.0
