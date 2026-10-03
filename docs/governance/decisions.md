# Decisions

Architecture Decision Records. Each captures a choice that is now **locked** —
the rationale is here so it is not silently relitigated. To change one, open an
issue and supersede the record; do not quietly diverge.

Format: Context → Decision → Consequences.

---

## ADR-001: Two runtime dependencies, standard library first

**Context.** The app must be easy to audit, patch, and self-host. Every
dependency is permanent, externally-maintained code.

**Decision.** Ship exactly `hono` and `@hono/node-server` at runtime. Reach for
the Node standard library (`node:sqlite`, `node:crypto`, `node:fs`, `node:zlib`)
first. Dev-only tooling is fine; runtime dependencies are not.

**Consequences.** A trivial supply-chain surface and a tiny image. Occasionally we
write more code ourselves (the tar reader, the rate limiter) than a library would
require — that is the accepted trade.

---

## ADR-002: No build step

**Context.** TypeScript normally needs a compile or bundle step.

**Decision.** Run `.ts` directly with Node's built-in type stripping (Node ≥ 24).
`npm start` is `node src/server.ts`; the container runs the same files.

**Consequences.** The edit→run loop is instant and the deployed artifact is the
source. In exchange, only *erasable* TypeScript syntax is allowed
(`erasableSyntaxOnly`), and there is no transpile-time optimisation.

---

## ADR-003: `node:sqlite` with a key/value `settings` table

**Context.** The app needs persistence, and it grows new theme settings over time.
`CREATE TABLE IF NOT EXISTS` cannot add columns to an existing database.

**Decision.** Use the built-in `node:sqlite` (WAL mode). Store **all theme state**
in a `settings` key/value table under `theme.*` keys. Only `profile`, `links`, and
`auth` are typed tables.

**Consequences.** Adding a theme setting needs no migration. Changing a *column*
on `profile`/`links` is a breaking change requiring a documented reset path. No
ORM, no query builder — parameterised SQL by hand.

---

## ADR-004: Server-rendered HTML, no frontend framework

**Context.** A link-in-bio page is mostly static content with a small editor.

**Decision.** Render HTML with template literals on the server. Ship one CSS file
per surface and a little progressive-enhancement JS. No React/Vue/Svelte, no
hydration, no SPA router.

**Consequences.** Fast first paint, works without JS, trivial to host. Rich
interactions (drag reorder, live previews) are written by hand.

---

## ADR-005: shadcn/ui reimplemented as hand-written CSS

**Context.** The admin should feel like a modern, familiar UI without pulling in
Tailwind + a component framework (violates ADR-001/002).

**Decision.** Reimplement shadcn/ui's *design language* — the dark token palette,
card/field/button shapes, focus rings — as plain CSS in `public/css/admin.css`.

**Consequences.** A consistent, good-looking admin with zero build tooling. New
components must be written by hand following
[ui-guidelines.md](ui-guidelines.md), not installed.

---

## ADR-006: Client-side image processing

**Context.** Favicons must be square PNGs and backgrounds should be downscaled
WebP; both need an image codec.

**Decision.** Do it in the browser with `<canvas>` (`public/js/admin.js`). The
server only magic-byte-validates and size-caps uploads.

**Consequences.** No server-side codec dependency, keeping the dependency budget
at two. No-JS uploads are stored as-is (still validated and capped) — an accepted
degradation.

---

## ADR-007: Stateless HMAC sessions and scrypt

**Context.** A single admin account needs login without a session store.

**Decision.** `scrypt` password hashing (`node:crypto`) with a per-install salt;
stateless HMAC-SHA256 session tokens in an `HttpOnly`, `SameSite=Lax`, `Secure`
cookie; double-submit CSRF on every state-changing POST; IP rate limiting on
login.

**Consequences.** No session table, no server-side session state. Changing the
password rotates the session secret, invalidating old sessions. Accepted limits
(scrypt defaults, no lockout) are recorded in [SECURITY.md](../../SECURITY.md).

---

## ADR-008: Dependency-free tar for backup/restore

**Context.** Backup/restore needs a `.tar.gz` archive.

**Decision.** Write a minimal ustar reader/writer (`src/tar.ts`) instead of adding
a tar library.

**Consequences.** Zero dependencies and full control over validation (rejecting
absolute paths, traversal, symlinks, device nodes). We own the format edge cases
and test them (`tests/tar.test.ts`).

---

## ADR-009: Rebase merges for a linear history

**Context.** Feature branches can be merged as merge commits, squash, or rebase.

**Decision.** Merge feature/fix PRs with a **rebase merge**, so each commit lands
on `main` in order with no merge node. Dependabot PRs stay squash-merged.

**Consequences.** A clean, linear, bisectable history. A rebase merge rewrites the
commits onto `main`, so the feature branch's original commits become orphaned —
delete the branch after merging.

---

## ADR-010: Background image opacity via a colour veil

**Context.** The theme supports a background image with an opacity and a solid
colour behind it. CSS has no way to set the opacity of a `background-image`.

**Decision.** Draw a translucent **veil** of the solid colour over the image:
`linear-gradient(rgba(r,g,b,1-opacity), rgba(r,g,b,1-opacity)), url(image) …, color`.
The colour also becomes the page background when there is no image.

**Consequences.** True "image over colour at N% opacity" using only CSS, with no
extra element or JS. The colour is the blend target, so opacity is only meaningful
alongside a colour (the admin enables the swatch with the colour checkbox).

---

## ADR-011: Visitor theme selection — server-baked default, pre-paint script

**Context.** The owner can force light/dark/system and optionally let visitors
switch. A JS-applied theme risks a flash of the wrong theme.

**Decision.** Bake a forced default into `<html data-theme="…">` so it applies
**without JS**. When visitor selection is enabled, load a tiny external
`theme.js` **synchronously in `<head>`** (before paint) that applies the visitor's
`localStorage` choice and wires the switcher. No inline scripts (CSP invariant).

**Consequences.** No flash of the wrong theme, a correct no-JS default, and a
strict `script-src 'self'`. The switcher is a progressive enhancement.

---

## ADR-012: The public page is a from-scratch reimplementation

**Context.** The page replaces a LinkStack install and reproduces its look
faithfully.

**Decision.** Reimplement the look in `public/css/style.css` from scratch. Copy
no LinkStack code; the verified-badge SVG is the one permitted asset (MIT).

**Consequences.** Clear licensing and a stylesheet we fully understand. Fidelity
is verified against the source page (see [PLAN.md](../PLAN.md)); small intentional
deltas are documented there.

---

## ADR-013: QR code from a hand-written encoder; the modal is CSS-only

**Context.** The public page offers a QR code for its own URL, opened by clicking
the avatar. Encoding a QR code needs GF(256) Reed-Solomon error correction,
symbol placement, and mask selection — normally a library. The project allows
exactly two runtime dependencies and prefers hand-written, understood code.

**Decision.** Implement the QR Code model-2 encoder in `src/qr.ts` (byte mode,
error-correction level M, versions 1–40) instead of adding a dependency — the
same call as the hand-written `src/tar.ts` (ADR-008). It returns a module matrix;
`render.ts` draws it as inline SVG, black on white so it scans in either theme.
The modal is pure CSS (`:target`), so it works with JavaScript disabled; a small
`public/js/qr.js` adds focus handling and Escape as progressive enhancement.

**Consequences.** No third-party code, so invariants 1 and 15 hold. The encoder
is unit-tested against Project Nayuki's reference (MIT): three full module
matrices plus a checksum sweep covering versions 1–40, all matching exactly —
including the automatic mask choice, which follows the standard penalty rules. A
new client file and a new source file are added to the source map in
[architecture.md](architecture.md).
