# API and data model

The app is server-rendered; there is no JSON API. This document describes the
HTTP routes, the SQLite schema, and the seed-file format.

## Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | public | Rendered profile page (includes canonical, `theme-color`, and schema.org `Person` JSON-LD) |
| `GET` | `/health` | public | `200 ok` |
| `GET` | `/robots.txt` | public | `text/plain`; allows the page, disallows `/admin` and `/login`, points at the sitemap |
| `GET` | `/sitemap.xml` | public | `application/xml`; single-URL sitemap for the canonical page |
| `GET` | `/llms.txt` | public | `text/plain`; profile summary and links for LLM/agent crawlers |
| `GET` | `/contact.vcf` | public | vCard 4.0 download (`text/vcard`, `Content-Disposition: attachment`) |
| `GET` | `/contact.json` | public | JSON profile summary for agents (`Access-Control-Allow-Origin: *`) |
| `GET` | `/.well-known/webfinger` | public | WebFinger JRD (RFC 7033) for `acct:me@<host>` / `acct:<slug>@<host>` / the base URL |
| `GET` | `/login` | public | Login form (sets the CSRF cookie) |
| `POST` | `/login` | public | Verify password; sets the session cookie; `302 /admin` |
| `POST` | `/logout` | public | Clears the session cookie; `302 /login` |
| `GET` | `/admin` | session | Admin editor |
| `POST` | `/admin/profile` | session + CSRF | Save the profile (name, tagline, description) |
| `POST` | `/admin/theme` | session + CSRF | Save the default theme mode, visitor toggle, and text colours (preserves favicon/background settings) |
| `POST` | `/admin/avatar` | session + CSRF | Upload an avatar (multipart, max 6 MB body) |
| `POST` | `/admin/favicon` | session + CSRF | Upload a favicon (multipart, max 6 MB body) |
| `POST` | `/admin/favicon/remove` | session + CSRF | Reset the favicon to the bundled default |
| `POST` | `/admin/background` | session + CSRF | Upload a background image for `theme=dark\|light` (multipart, max 9 MB body) |
| `POST` | `/admin/background/remove` | session + CSRF | Remove the background image for `theme=dark\|light` |
| `POST` | `/admin/background/options` | session + CSRF | Set size/position/repeat/attachment, opacity, and colour for `theme=dark\|light` |
| `POST` | `/admin/links` | session + CSRF | Create a link, or update when `id` is present |
| `POST` | `/admin/links/:id/delete` | session + CSRF | Delete a link |
| `POST` | `/admin/links/reorder` | session + CSRF | Persist order from a comma-separated `order` field |
| `GET` | `/admin/backup` | session | Download a `.tar.gz` of the profile, theme, links, and uploads |
| `POST` | `/admin/restore` | session + CSRF | Validate and apply an uploaded `.tar.gz` backup |
| `GET` | `/assets/*` | public | Bundled assets from `public/` |
| `GET` | `/assets/uploads/*` | public | Uploaded files from `DATA_DIR/uploads/` |

Unauthenticated requests to `/admin*` receive `302 /login`. Admin POSTs without a
valid CSRF token receive `403`. Invalid input redirects back to `/admin?error=...`.

## Contact and discovery endpoints

All are derived from the profile at request time — no personal data is stored in
the repository.

- **`/contact.vcf`** — a vCard 4.0 (`FN`, `N`, `TITLE`, `NOTE`, `PHOTO`, one `URL`
  per link, `UID`, `REV`). Values are escaped, control characters stripped from
  URLs, and lines folded per RFC 6350. `REV` is the profile's `updated_at`, so the
  document is stable between edits. The homepage links it with
  `<link rel="alternate" type="text/vcard">` and a visible "Add to contacts" link.
- **`/contact.json`** — `{ name, tagline, description, url, avatar, vcard, links[] }`.
- **`/.well-known/webfinger`** — answers `resource=acct:me@<host>`,
  `acct:<name-slug>@<host>`, or the base URL; anything else is `404`, and a
  missing `resource` is `400` (RFC 7033 §4.2). The JRD's `subject` echoes the
  requested resource and it advertises the profile page, avatar, vCard, JSON, and
  each link as `rel="me"`.
- The homepage also sends `Link: </contact.vcf>; rel="alternate"; type="text/vcard",
  </contact.json>; rel="alternate"; type="application/json"` and one
  `<link rel="me">` per link.

## Database schema

SQLite, opened with WAL mode and foreign keys on. Created on first run.

### `profile` (single row, `id = 1`)

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT | Display name |
| `tagline` | TEXT | Short line under the name |
| `description` | TEXT | Bio paragraph |
| `avatar_path` | TEXT NULL | `/assets/uploads/...`, or NULL for the bundled default |
| `updated_at` | TEXT | `datetime('now')` |

### `links`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `position` | INTEGER | Display order, ascending |
| `text` | TEXT | Button label |
| `url` | TEXT | `http(s)` only |
| `new_window` | INTEGER | 0/1 |
| `icon_type` | TEXT | `fa` or `image` |
| `icon_value` | TEXT | Font Awesome class, or an image path |
| `icon_color` | TEXT NULL | NULL inherits the text colour |
| `text_color` | TEXT | Hex |
| `color_mode` | TEXT | `solid` or `gradient` |
| `color_from` | TEXT | Hex |
| `color_to` | TEXT | Hex (used when `gradient`) |
| `border_color` | TEXT NULL | NULL means no border |
| `created_at` / `updated_at` | TEXT | `datetime('now')` |

### `settings` (key/value)

Theme values are stored under `theme.*` keys: `backgroundDark`, `backgroundLight`,
`textDark`, `textLight`, `accentColor`, `faviconPath`, `defaultMode`,
`visitorToggle`, and, per colour scheme,
`theme.backgroundImageDark.*` / `theme.backgroundImageLight.*` with the sub-keys
`imagePath`, `size`, `position`, `repeat`, and `attachment`. Adding these keys
needs no schema migration — `settings` is a key/value table.

### `auth` (single row, `id = 1`)

| Column | Type | Notes |
|---|---|---|
| `password_hash` | TEXT | scrypt output, hex |
| `password_salt` | TEXT | Random hex |
| `session_secret` | TEXT | HMAC key for session tokens |
| `updated_at` | TEXT | |

## Theme value format

`backgroundDark` / `backgroundLight` are the base CSS `background` layer (a colour
or gradient) shown beneath any background image. They are passed through
`sanitizeCss`, which permits only `[a-zA-Z0-9#(),.%\s/-]`.

Each colour scheme also has a `BackgroundSettings` object:

| Field | Values | Default |
|---|---|---|
| `imagePath` | `/assets/uploads/...` or `null` | `null` |
| `size` | `cover`, `contain`, `stretch`, `auto` | `cover` |
| `position` | `center`, `top`, `bottom`, `left`, `right`, `top left`, `top right`, `bottom left`, `bottom right` | `center` |
| `repeat` | `no-repeat`, `repeat` | `no-repeat` |
| `attachment` | `scroll`, `fixed` | `scroll` |
| `color` | hex (`#rrggbb`) or `null` | `null` |
| `opacity` | `0`–`100` | `100` |

`color` is the solid colour behind the image, and is also used as the page
background when there is no image (`null` falls back to `backgroundDark` /
`backgroundLight`). `opacity` fades the image toward that colour: because CSS
cannot set the opacity of a `background-image`, the renderer draws a translucent
veil of `color` over the image instead. With an image, no colour, or full
opacity, the value stays a plain shorthand:

```
url(/assets/uploads/bg.webp) bottom right/contain repeat fixed, radial-gradient(circle, #151826 28%, #0d0f18 100%)
```

At 40% opacity over `#112233`, it becomes:

```
linear-gradient(rgba(17, 34, 51, 0.6), rgba(17, 34, 51, 0.6)), url(/assets/uploads/bg.webp) center/cover no-repeat scroll, #112233
```

Every option is an enum or a validated hex colour, so no user-supplied string
reaches the stylesheet except the validated asset path. `background-attachment:
fixed` is unreliable on iOS Safari; `scroll` is the safe default.

### Theme mode and visitor selection

| Field | Values | Default | Meaning |
|---|---|---|---|
| `defaultMode` | `light`, `dark`, `system` | `system` | The scheme shown when a visitor has not chosen one. `system` follows `prefers-color-scheme`. |
| `visitorToggle` | boolean | `false` | When true, the public page renders a bottom-right switcher and honours a visitor's saved choice. |

A forced `light`/`dark` default is baked into the `<html data-theme="...">`
attribute, so it applies without JavaScript. When `visitorToggle` is on, the
page also loads `/assets/js/theme.js` (synchronously, before paint) which applies
the visitor's `localStorage` choice and wires the switcher. The switcher offers
light, dark, and system; choosing system clears the stored override.

## Seed file

On first run, `ensureSeeded` applies the built-in demo profile from
`src/defaults.ts` (`DEFAULT_SEED`) when the database has no profile row. It is
idempotent and never overwrites existing content.

`node src/seed.ts <file.json>` replaces the profile, theme, and all links. See
`personal-seed.example.json` for the shape:

```json
{
  "profile": { "name": "...", "tagline": "...", "description": "...", "avatarPath": "/assets/uploads/avatar.jpg" },
  "theme": {
    "backgroundDark": "...", "backgroundLight": "...",
    "textDark": "#ffffff", "textLight": "#222222",
    "accentColor": "#0085ff", "faviconPath": "/assets/favicon.png",
    "backgroundImageDark": {
      "imagePath": "/assets/uploads/bg-dark.webp",
      "size": "cover", "position": "center",
      "repeat": "no-repeat", "attachment": "scroll",
      "color": "#112233", "opacity": 60
    },
    "backgroundImageLight": {
      "imagePath": null, "size": "cover", "position": "center",
      "repeat": "no-repeat", "attachment": "scroll",
      "color": null, "opacity": 100
    },
    "defaultMode": "system",
    "visitorToggle": false
  },
  "links": [
    {
      "text": "Example", "url": "https://example.com", "newWindow": true,
      "iconType": "fa", "iconValue": "fa-solid fa-link", "iconColor": null,
      "textColor": "#ffffff", "colorMode": "solid",
      "colorFrom": "#0085ff", "colorTo": "#0085ff", "borderColor": null
    }
  ]
}
```

Image paths in a seed file refer to files under `DATA_DIR/uploads/`; the JSON and
the uploads must travel together. `backgroundImageDark` / `backgroundImageLight`,
`defaultMode`, and `visitorToggle` are optional: older seed files without them are
filled in with the defaults above.

## Backup archive format

`GET /admin/backup` returns a gzip-compressed tar (`.tar.gz`) containing:

```
seed.json          # the current profile, theme, and links
uploads/<file>     # every file in DATA_DIR/uploads/
```

`POST /admin/restore` accepts the same layout. Validation, in order:

1. Size cap: 50 MB compressed, 100 MB decompressed.
2. Valid gzip, then a valid tar. Entry names must be relative, with no `..` or
   backslashes; symlinks and device nodes are rejected.
3. A `seed.json` at the archive root (or, for hand-made archives, a single
   root-level `*.json` file). The seed is parsed and validated with the same URL
   and asset-path rules as the admin routes.
4. Every `uploads/*` entry must be a JPEG, PNG, or WebP (by magic bytes) or an
   SVG. SVGs are stripped of `<script>` elements, `on*` handlers, and
   `javascript:` URLs.
5. macOS AppleDouble (`._*`) and `.DS_Store` entries are ignored.

Nothing is written until all entries pass. New files are written first, then any
file not present in the archive is removed, so a failure never leaves the uploads
directory empty.
