# Third-party assets and dependencies

`profile-page` is MIT-licensed (see [LICENSE](../LICENSE)). It bundles the
following third-party components.

## Runtime dependencies

| Package | Version | License |
|---|---|---|
| [hono](https://github.com/honojs/hono) | 4.13.12 | MIT |
| [@hono/node-server](https://github.com/honojs/node-server) | 2.1.3 | MIT |

## Bundled assets

| Asset | Location | License |
|---|---|---|
| Inter (400/600/700, latin subset) | `public/fonts/inter/` | SIL Open Font License 1.1 |
| Font Awesome Free 6.7.1 — fonts | `public/fonts/fa/` | SIL Open Font License 1.1 |
| Font Awesome Free 6.7.1 — icons | `public/css/fontawesome.css` | CC BY 4.0 |
| Font Awesome Free 6.7.1 — code | `public/css/fontawesome.css` | MIT |
| Simple Icons (GitHub, LinkedIn, Matrix, Signal) | `public/icons/` | CC0 1.0 Universal |
| Default avatar | `public/default-avatar.svg` | MIT (this project) |
| Favicon | `public/favicon.png` | MIT (this project) |

## Design inspiration

The public page reimplements the look of [LinkStack](https://linkstack.org/)
(MIT). No LinkStack code is copied; the CSS in `public/css/style.css` is written
from scratch. The verified-badge SVG is a LinkStack asset (MIT).

## Development-time references

- [Project Nayuki's qrcodegen](https://www.nayuki.io/page/qr-code-generator-library)
  (MIT) — used only to generate the QR Code reference vectors and version sweep
  in `tests/qr.test.ts`. No code is vendored; the encoder in `src/qr.ts` is
  written from scratch to ISO/IEC 18004.

## Attribution notes

- **Font Awesome Free** — icons are CC BY 4.0 and require attribution; the
  attribution is retained in `public/css/fontawesome.css`. Fonts are OFL 1.1.
- **Inter** — OFL 1.1; the license permits bundling and redistribution.
- **Simple Icons** — released under CC0 1.0; no attribution required, provided
  here for completeness.

Full license texts ship with the upstream projects. If you redistribute this
project, keep this file and the upstream license notices intact.
