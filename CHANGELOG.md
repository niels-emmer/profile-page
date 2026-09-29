# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
