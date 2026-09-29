# profile-page

[![CI](https://github.com/niels-emmer/profile-page/actions/workflows/ci.yml/badge.svg)](https://github.com/niels-emmer/profile-page/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A minimal, self-hosted, single-user **profile page** — a lightweight replacement
for LinkStack. One small container, one SQLite file, an online admin editor, and
a pixel-faithful link-in-bio page.

<p align="center">
  <img src="docs/screenshot-dark.png" alt="Profile page, dark theme" width="380">
  <img src="docs/screenshot-light.png" alt="Profile page, light theme" width="380">
</p>

| | |
|---|---|
| **Image size** | ~50 MB (Alpine + Node, no build step) |
| **Runtime deps** | 2 (`hono`, `@hono/node-server`) |
| **Storage** | SQLite (`node:sqlite`) + local uploads |
| **Frontend** | Server-rendered HTML + one CSS file. No JS framework. |

## Features

- Public profile page at `/` with name, tagline, description, avatar and a list
  of link buttons.
- Online editor at `/admin` (login required) — edit text, upload an avatar,
  add/reorder/delete links, pick button colours.
- One-click **backup and restore** — download the whole profile (content, theme,
  and images) as a `.tar.gz`, and restore it later.
- Colour helpers: curated colour schemes, or generate a solid/gradient button
  from a single base colour with an automatically readable text colour.
- Dark and light themes that follow the visitor's OS preference.
- No admin or login link is exposed on the public page — navigate to `/admin`
  directly.
- Ships with a **representative demo profile** (a placeholder person and a few
  example links) so a fresh install is not an empty page. Personal content is
  never committed: it lives in the gitignored `data/` directory.

## Requirements

- **Docker** with Compose (recommended), or **Node.js >= 24** for a local run.
- A reverse proxy that terminates TLS (e.g. Nginx Proxy Manager, Caddy, Traefik)
  for public deployments.

## Quick start (Docker)

```bash
git clone https://github.com/niels-emmer/profile-page.git
cd profile-page
cp .env.example .env
# optional: set ADMIN_PASSWORD in .env; otherwise one is generated on first run
docker compose up -d --build
docker compose logs profile-page   # first-run password is printed here if generated
```

The container joins the external `proxy-net` network and listens on port `3000`.
Point your reverse proxy (e.g. Nginx Proxy Manager) at `http://profile-page:3000`.
Create the network once if it does not exist:

```bash
docker network create proxy-net
```

## Quick start (local)

```bash
npm install
npm run seed      # create the database and demo profile
npm start         # http://localhost:3000
```

## Seeding personal content

On first run the app seeds a demo profile ("Alex Rivera" and a few example
links) so you can see the layout immediately. Edit it in `/admin`, or replace it
wholesale with a seed file: copy `personal-seed.example.json`, fill it in, and
apply it:

```bash
cp personal-seed.example.json data/personal-seed.json
# edit data/personal-seed.json, then:
node src/seed.ts data/personal-seed.json
```

A seed replaces the profile, theme, and all links. Image paths in the seed refer
to files under `data/uploads/`, so the JSON and its uploads must travel together.
Both live in the gitignored `data/` directory and are never committed.

## Development

```bash
npm test          # node:test suite (auth, colours, uploads, render, routes)
npm run typecheck # tsc --noEmit
npm run dev       # watch mode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Configuration

All configuration is via environment variables (see `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `DATA_DIR` | `./data` (`/data` in Docker) | SQLite database + uploads |
| `ADMIN_PASSWORD` | *(generated)* | Admin password. If unset, a random one is generated on first run and logged once. |
| `SESSION_SECRET` | *(generated)* | Cookie signing secret. Generated and persisted if unset. |
| `SECURE_COOKIES` | `true` in production | Adds the `Secure` flag to session cookies. Set `false` only for plain-HTTP local development. |
| `BASE_URL` | *(request host)* | Public base URL for meta tags. |

## Security

See [SECURITY.md](SECURITY.md). Highlights: scrypt password hashing,
signed HttpOnly `SameSite=Lax` cookies, CSRF protection, login rate limiting,
upload validation, strict security headers, parameterised SQL, and a non-root,
read-only container.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — reverse proxy, backups, upgrades
- [SECURITY.md](SECURITY.md) — threat model and hardening
- [docs/API.md](docs/API.md) — routes, data model, and seed format
- [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) — bundled assets and licenses

## License

MIT — see [LICENSE](LICENSE). Bundled third-party assets are listed in
[docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).
