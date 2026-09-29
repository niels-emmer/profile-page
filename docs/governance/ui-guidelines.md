# UI guidelines

Two distinct surfaces share one codebase. This document records the design
decisions, the tokens, and the component patterns so new UI looks like it was
always there.

## Surfaces

| Surface | Stylesheet | Look | Theme |
|---|---|---|---|
| **Public page** (`/`) | `public/css/style.css` | LinkStack / Skeleton-inspired: centred column, big rounded buttons, entrance animations | Dark **and** light, following the theme setting / visitor choice |
| **Admin** (`/admin`, `/login`) | `public/css/admin.css` | shadcn/ui dark: neutral cards, subtle borders, compact controls | Always dark |

The admin is deliberately a fixed dark UI. The *content* it edits has dark/light
themes, but the editor itself does not switch.

## Fonts

All self-hosted (no external font CDN — `font-src 'self'`).

| Font | Weights / set | Location | Use |
|---|---|---|---|
| **Inter** | 400 / 600 / 700, latin subset | `public/fonts/inter/*.woff2` | Everything |
| **Font Awesome Free 6.7.1** | solid, regular, brands (full set) | `public/fonts/fa/*.woff2` + `public/css/fontawesome.css` | Link icons, admin/theme-switcher icons |
| **Simple Icons** | GitHub, LinkedIn, Matrix, Signal | `public/icons/*.svg` (white fill) | Bundled brand marks |

Notes:

- The public page uses Inter at an **18px** base (`line-height: 24px`); `h1` is
  weight **800** (24px mobile → 48px at ≥550px). The admin uses Inter at
  **0.875rem**.
- A Font Awesome link icon must include its family class (`fa-solid`, `fa-regular`,
  or `fa-brands`) or the glyph will not render — this is the single most common
  icon mistake, and it is documented in the README for end users.
- Licences and attribution: [THIRD-PARTY.md](../THIRD-PARTY.md).

## Admin design tokens

Defined once in `:root` in `public/css/admin.css` (shadcn/ui dark palette, HSL
channel triples used as `hsl(var(--token))`):

```
--background 240 10% 3.9%      --primary 0 0% 98%
--foreground 0 0% 98%          --primary-foreground 240 5.9% 10%
--card 240 10% 3.9%            --secondary 240 3.7% 15.9%
--card-foreground 0 0% 98%     --muted 240 3.7% 15.9%
--hover 240 3.7% 15.9%         --muted-foreground 240 5% 64.9%
--border 240 3.7% 15.9%        --destructive 0 72% 51%
--input 240 3.7% 15.9%         --destructive-foreground 0 0% 98%
--ring 217 91% 60%             --radius 0.5rem
```

Rules: never hard-code a colour in a component; reference a token. Radius
variants are derived (`calc(var(--radius) - 2px)` for controls,
`calc(var(--radius) - 4px)` for the smallest). Focus is a `--ring` box-shadow
(`0 0 0 3px hsl(var(--ring) / 0.25)`), not an outline.

## Admin components

Reuse these classes; do not invent new ones for the same job.

| Pattern | Classes | Notes |
|---|---|---|
| Page shell | `.admin-body`, `.admin-header`, `.admin-main`, `.admin-shell`, `.admin-nav`, `.admin-content` | Sticky header + sticky sidebar nav; nav collapses to wrapping pills under 820px |
| Card | `.admin-card`, `.admin-card-header`, `.admin-card-description` | One card per admin section, `id` matches the nav anchor |
| Sub-section | `.admin-subsection`, `.admin-subsection-title`, `.admin-subsection-description` | A bordered panel *inside* a card (e.g. Backup and Restore) |
| Field | `.admin-field` (+ `--color`, `--range`) | Label above control; `.admin-field--color` puts a compact swatch inline right |
| Grid | `.admin-grid` | `auto-fit, minmax(160px, 1fr)` — keeps related selects from stacking full-width |
| File row | `.admin-file-row` | `[file input] [Upload] [Remove]` inline |
| Colour toggle | `.admin-color-toggle` | Checkbox left, swatch right; swatch disabled when unchecked |
| Range | `.admin-field--range`, `.admin-range-head`, `.admin-range-value` | Slider with a live `%` readout |
| Buttons | `.admin-button` + `--sm` / `--outline` / `--ghost` / `--danger` | Primary = light on dark; `--danger` for destructive; `--outline`/`--ghost` for secondary |
| Banners | `.admin-ok`, `.admin-error` | Post-save feedback and validation errors |
| Collapsible | `.bg-section` / `.link-card` (`<details>`) | `▸` marker rotates on open; `<summary>` is the whole click target |
| Link card | `.link-card`, `.link-title`, `.drag-handle` | Collapsed shows the link text + drag handle; expanded shows the editor |
| Presets | `.preset-row`, `.preset` | Colour-scheme swatches that fill the nearest form |
| Preview image | `.admin-og-preview` (+ `--empty`) | 1200×630 card preview; the **Generate** button renders the profile card on a canvas and uploads it (JS-only), with a plain file upload as the no-JS fallback |
| Icon fields | `form[data-icon-type-form]`, `[data-icon-fields]`, `[data-icon-value-label]`, `.admin-icon-upload` | The link editor shows only the icon fields for the selected type: Font Awesome (lookup link + colour) vs image (path + upload button). JS toggles `[hidden]` and relabels the shared field; without JS everything stays visible |

### Decisions made (and why)

- **Colour pickers are compact swatches**, inline with their label, not
  full-width bars. A native `<input type="color">` inherits `width: 100%` from
  `.admin-field input`, which produced giant stripes. `.admin-field--color` fixes
  the width to `3rem` and lays the field out as a row.
- **Related selects go in `.admin-grid`**, so Size/Position/Scroll sit side by
  side instead of each taking a full row.
- **Upload + Remove are one row.** The Remove button lives in the upload row but
  submits its *own* form via the HTML5 `form=` attribute, so the two forms do not
  nest and the layout stays tidy.
- **Destructive cards are split into labelled sub-sections.** Backup & restore is
  two panels ("Backup" / "Restore"), each with its own description, so the
  download button is not orphaned above unrelated text.
- **Long forms are grouped, not dumped.** The Background section groups image,
  appearance (opacity + colour), and placement.
- **Confirm before destroying.** `data-confirm` on a form triggers a
  `window.confirm` (see `admin.js`); destructive buttons use `--danger`.

## Public page

Variables set per request in a `<style>` block emitted by `render.ts`:

```
--accent   the accent colour (theme.accentColor)
--bg       the composed background (colour/gradient/image+veil)
--fg       the text colour
```

- **Theme selection** — `:root[data-theme='dark'|'light']` wins; with no
  attribute the OS preference applies via `prefers-color-scheme`. The same rules
  drive the scrollbar colours.
- **Background composition** — see
  [architecture.md](architecture.md#theme-and-background-composition) and
  [decisions.md](decisions.md#adr-010-background-image-opacity-via-a-colour-veil).
- **Buttons** — 300px wide, 8px radius, `linear-gradient(45deg, from, to)` per
  link, a `border` when a border colour is set. Hover scales to `1.1` and animates
  the icon (`icon-hover`).
- **Entrance animations** — `.button-entrance` (`popUp`, staggered via `--delay`)
  and `.fadein`. Both are disabled under `prefers-reduced-motion: reduce`.
- **Theme switcher** — when the owner enables visitor selection, a single
  half-circle icon sits fixed in the bottom-right. It expands on hover/focus
  (desktop) or tap (mobile) to offer light / dark / system; the active option is
  outlined in `--accent`. It is intentionally small and out of the content flow.
- **No-JS** — the page is fully readable and the forced default still applies
  (the `data-theme` attribute is server-rendered). The switcher and the admin's
  sliders are progressive enhancement only.

## Accessibility

- **Focus is always visible** — `:focus-visible` ring on buttons, inputs, and the
  switcher (`--ring` / `--accent`), with an offset.
- **Icon-only controls carry `aria-label`** (drag handle, theme switcher options).
- **Semantics** — `<nav>`, `<main>`, `<header>`, `<section>`, `<details>/<summary>`;
  the theme menu uses `role="menu"` / `role="menuitemradio"` with `aria-checked`.
- **State is announced** — `aria-expanded` on the switcher toggle; `.admin-ok`
  and `.admin-error` are plain text, not colour-only.
- **Everything works without JS.** No behaviour depends on a script running.
- **Contrast** — `readableTextColor` picks black or white text for a link colour
  by luminance; keep body text on token colours that already meet contrast.

## Rules for new UI

1. **Reuse** an existing class before writing a new one.
2. **Tokens, not literals.** No hard-coded hex in `admin.css`.
3. **No framework, no preprocessor, no inline scripts.** One stylesheet per
   surface; JS lives in `public/js/`.
4. **Hand-written and small.** If a component needs a build step, it is the wrong
   component.
5. **Check the rendered result** at desktop **and** mobile widths, in both themes
   where the surface supports them, before calling UI work done.
6. **Keep destructive actions** `--danger`, confirmed, and separated from the
   safe ones.
