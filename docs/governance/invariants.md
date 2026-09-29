# Invariants

The rules below are **non-negotiable**. They are what makes this project small,
auditable, and reproducible. If a change requires breaking one of them, stop and
open an issue first — the default answer is no.

Each invariant states the rule, why it exists, and how it is enforced.

---

## 1. Exactly two runtime dependencies

`hono` and `@hono/node-server` — nothing else.

**Why.** Every dependency is permanent, uncontrolled code maintained on someone
else's schedule. A link-in-bio page is small enough to stay dependency-light, and
a two-dependency tree is trivial to audit and keep patched.

**Enforced by.** `package.json` (`dependencies` has exactly two entries);
review. Dev-only tooling (`typescript`, `@types/node`) is acceptable, but
prefer the Node standard library for anything at runtime.

**Before adding one:** check the standard library first; if it truly earns its
place, it must be OSI-licensed (MIT/Apache/BSD/LGPL — not AGPL), maintained, CVE-
free, pinned exactly (`save-exact=true`), and documented in
[THIRD-PARTY.md](../THIRD-PARTY.md).

---

## 2. No build step

TypeScript is executed **directly** by Node's type stripping. There is no
bundler, transpiler, framework, or codegen.

**Why.** `git clone && node src/server.ts` is the whole development loop. A build
step adds a toolchain, a stale-artifact class of bugs, and CI time for no gain.

**Enforced by.** `npm start` runs `node src/server.ts`; the Dockerfile copies
`src/` and runs it unchanged; `tsconfig.json` sets `noEmit: true`.

**Consequence.** Only *erasable* TypeScript is allowed (see invariant 3).

---

## 3. Erasable-only TypeScript syntax

No `enum`, no `namespace`, no parameter properties (`constructor(private x)`), no
`import =`. Types must be removable by Node without code generation.

**Why.** Node strips types; it cannot *transform* syntax. Non-erasable syntax
would force a build step (invariant 2).

**Enforced by.** `tsconfig.json` → `erasableSyntaxOnly: true`. Use `const`
objects + union types instead of `enum` (e.g. `ThemeMode` in `src/types.ts`).

---

## 4. Strict TypeScript, kept strict

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`.

**Why.** These flags catch real bugs (undefined index access, accidental
`undefined` assignment, unused code) and keep the codebase honest.

**Enforced by.** `tsconfig.json`; `npm run typecheck` in CI. Never loosen a flag
to make a change compile — fix the change.

---

## 5. Personal data never enters the repository

Profile content, the SQLite database, uploads, and `.env` live in the
**gitignored** `data/` directory and the environment. They are never committed,
never logged, and never echoed.

**Why.** The repository is public. The app is single-user; the content is the
user's own.

**Enforced by.** `.gitignore` (`data/*`, `*.db*`, `.env`), `.dockerignore`, and
review. `data/.gitkeep` keeps the directory present in git.

---

## 6. Secrets come from the environment

`ADMIN_PASSWORD`, `SESSION_SECRET`, and everything else are read from env vars.
No secret is ever inlined in code, docs, or a prompt.

**Why.** Inlined secrets leak into git history and container layers.

**Enforced by.** `src/config.ts` reads `process.env`; `.env` is gitignored;
`.env.example` documents the variables with placeholder values.

---

## 7. Every output path is escaped or validated

- **HTML** — all interpolated values pass through `escapeHtml`.
- **CSS** — admin-supplied values pass through `sanitizeCss`.
- **SQL** — every query is parameterised; string-built SQL is forbidden.
- **URLs** — `isHttpUrl` (http/https only, no control chars).
- **Asset refs** — `isSafeAssetRef` (local `/assets/` only).
- **Enums** — background size/position/repeat/attachment/mode are validated
  against fixed lists before they reach the stylesheet.

**Why.** This is a server-rendered app that reflects user input into HTML, CSS,
and SQL. The escaping/validation layer is the security boundary.

**Enforced by.** `src/render.ts` (`escapeHtml`, `sanitizeCss`), `src/validate.ts`,
parameterised statements in `src/db.ts`, and the tests in `tests/render.test.ts`.

---

## 8. The Content-Security-Policy stays strict

`script-src 'self'` — **no inline scripts, ever**. `style-src` keeps
`'unsafe-inline'` because the public page emits a per-request `<style>` block and
inline link-colour styles.

**Why.** A strict script policy is the strongest XSS mitigation available. Inline
scripts would defeat it; inline *styles* are a deliberate, bounded exception.

**Enforced by.** `CSP` in `src/app.ts`. New client behaviour goes in an external
file under `public/js/` (e.g. `theme.js`, `admin.js`).

---

## 9. Theme settings use the key/value table — no migration

Theme values live in the `settings` table under `theme.*` keys. Adding a new
theme setting needs **no schema change**.

**Why.** `CREATE TABLE IF NOT EXISTS` cannot add columns to an existing database.
A key/value table sidesteps migrations for the most frequently extended area.

**Enforced by.** `getTheme`/`saveTheme` in `src/db.ts`. If you must change a
*column* (e.g. `profile`, `links`), that is a breaking change: document it, bump
the major/minor version, and provide a reset path (see
[DEPLOYMENT.md](../DEPLOYMENT.md)).

---

## 10. The container stays hardened

Non-root `node` user, `read_only: true` root filesystem, writable `/data` volume,
tmpfs `/tmp`, `cap_drop: ALL`, `no-new-privileges`, **no published ports**, and a
`/health` healthcheck.

**Why.** The app assumes it runs behind a TLS-terminating proxy on a private
network. The hardening limits blast radius if the app is ever compromised.

**Enforced by.** `Dockerfile`, `docker-compose.yml`, and review. Do not add a
published port or drop a security option.

---

## 11. Asset references are local

`faviconPath` and image-type `iconValue` must be `/assets/...` paths (bundled or
under `/assets/uploads/`). External URLs are rejected.

**Why.** It matches the `img-src 'self'` CSP and prevents the page from becoming
an open image proxy.

**Enforced by.** `isSafeAssetRef` in `src/validate.ts`.

---

## 12. Images are processed in the browser

Resizing and format conversion (favicon → 512×512 PNG, background → WebP) happen
client-side with `<canvas>`. The server only magic-byte-validates and size-caps
what it receives.

**Why.** A server-side image codec would add a runtime dependency (invariant 1).
The browser already has one.

**Enforced by.** `public/js/admin.js`; `src/upload.ts` does validation only.
No-JS uploads are stored as-is (still validated and capped).

---

## 13. `npm run typecheck` and `npm test` must pass

CI runs both on every pull request. A change that cannot pass both is not done.

**Why.** The test suite is the regression net; the type checker is the first
line of defence. "Looks right" is not "runs right".

**Enforced by.** `.github/workflows/ci.yml`.

---

## 14. One concern per commit

Small, focused commits with [Conventional Commits](https://www.conventionalcommits.org/)
messages. See [workflow.md](workflow.md).

**Why.** Reviewable history; a bisect that points at a real change; a changelog
that writes itself.

---

## 15. The public page is written from scratch

The public look is a clean reimplementation of the LinkStack/Skeleton style. **No
LinkStack code is copied.** The verified-badge SVG is the one permitted LinkStack
asset (MIT), recorded in [THIRD-PARTY.md](../THIRD-PARTY.md).

**Why.** Licensing clarity and a codebase we fully understand.
