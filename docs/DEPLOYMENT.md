# Deployment

## Requirements

- Docker with Compose, or Node.js >= 24 for a local run.
- A reverse proxy that terminates TLS (e.g. Nginx Proxy Manager, Caddy, Traefik).
- An external Docker network named `proxy-net` shared with the proxy.

## Docker

```bash
git clone <repo> profile-page && cd profile-page
cp .env.example .env
docker compose up -d --build
# First run: sign in at /admin with the bootstrap password "changeme" — you
# will be asked to pick your own secure password.
```

The container joins `proxy-net` and listens on port `3000`. No ports are
published. Point the reverse proxy at `http://profile-page:3000`.

Create the network once if it does not exist:

```bash
docker network create proxy-net
```

### Reverse proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location / {
        proxy_pass http://profile-page:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Overwrite, do not append, so the app sees a trustworthy client IP.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The app reads the **last** `X-Forwarded-For` entry for rate limiting. Setting the
header with `$remote_addr` (rather than `$proxy_add_x_forwarded_for`) is the
safest configuration.

## Configuration

All configuration is via environment variables (see `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `DATA_DIR` | `./data` (`/data` in Docker) | SQLite database + uploads |
| `SESSION_SECRET` | *(generated)* | Cookie signing secret. Generated and persisted if unset. |
| `SECURE_COOKIES` | `true` in production | Adds the `Secure` flag to session cookies. Set `false` only for plain-HTTP local development. |
| `BASE_URL` | *(request host)* | Public base URL for meta tags. |

The admin password is **not** an environment variable. A fresh install starts
with the bootstrap password `changeme` and the first visit to `/admin` forces a
change. Forgot it? Reset from the container, then restart so the app picks it up
(this also signs out every session):

```bash
docker exec -it profile-page node src/reset-password.ts
docker compose restart profile-page
# resets to "changeme" — log in and you will be asked to set a new one
# or pick the new password directly:
docker exec -it profile-page node src/reset-password.ts 'my-new-password'
docker compose restart profile-page
```

## Data and backups

Everything stateful lives in `DATA_DIR`:

```
data/
  profile.db        # SQLite database (profile, links, theme, auth)
  uploads/          # avatar, background, and link icons
```

Back up the whole directory. To move an installation, copy `data/` to the new
host and start the container.

### Backup and restore from the admin panel

`/admin` has a **Backup & restore** section:

- **Download backup** produces a `.tar.gz` containing `seed.json` (profile,
  theme, links) and every file in `uploads/` — including an uploaded favicon and
  background images.
- **Restore backup** accepts such an archive, validates it fully, then replaces
  the profile, theme, links, and uploaded images. Backups made before background
  images existed still restore: missing background fields fall back to defaults.

Restore is destructive: it overwrites the current setup. Download a fresh backup
before restoring an older one. The archive format and validation rules are in
[API.md](API.md#backup-archive-format).

For a filesystem-level backup, copy `data/` directly:

```bash
tar -czf data-backup.tar.gz -C . data
```

## Upgrades

```bash
git pull
docker compose up -d --build
```

The database schema is created on first run, and a representative demo profile
is seeded if the database has no profile yet. Seeding is idempotent: once a
profile exists, nothing is touched, so your edits (including deleting every link)
survive restarts.

There is currently **no automatic migration** — if a release changes the schema,
an existing `profile.db` may be missing new columns. Back up `data/` before
upgrading, and if the app reports a missing column, reset the database (see
below) and re-apply your seed.

## Resetting

To start over with an empty default profile:

```bash
docker compose down
rm -f data/profile.db data/profile.db-shm data/profile.db-wal
docker compose up -d
```

To restore personal content, apply a seed file:

```bash
node src/seed.ts data/personal-seed.json
```

## Local development

```bash
npm install
npm run seed      # create the empty profile database
npm start         # http://localhost:3000
npm run dev       # watch mode
npm test          # node:test suite
npm run typecheck # tsc --noEmit
```

Local runs default to `DATA_DIR=./data` and `SECURE_COOKIES=false`. If port 3000
is taken, set `PORT` (e.g. `PORT=3999 npm start`).

## Healthcheck

`GET /health` returns `200 ok`. The image defines a Docker healthcheck against it.
