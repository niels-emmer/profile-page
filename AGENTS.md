# AGENTS.md

Guidance for AI coding agents (and anyone else) working in this repository.
**Read [docs/governance/](docs/governance/) before making changes** — it is the
project's rulebook, grounded in the actual code and design decisions.

## Start here

| Read | For |
|---|---|
| [docs/governance/invariants.md](docs/governance/invariants.md) | The non-negotiable rules. **Read first.** |
| [docs/governance/architecture.md](docs/governance/architecture.md) | System design and where to add code. |
| [docs/governance/style-guide.md](docs/governance/style-guide.md) | Code style. |
| [docs/governance/ui-guidelines.md](docs/governance/ui-guidelines.md) | Design system: tokens, fonts, components, UI decisions. |
| [docs/governance/testing.md](docs/governance/testing.md) | Testing approach. |
| [docs/governance/workflow.md](docs/governance/workflow.md) | Commits, branches, PRs, releases. |
| [docs/governance/decisions.md](docs/governance/decisions.md) | Locked decisions (ADRs). |

Reference: [docs/API.md](docs/API.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[SECURITY.md](SECURITY.md) · [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) ·
[CONTRIBUTING.md](CONTRIBUTING.md)

## What this is

A minimal, self-hosted, **single-user** link-in-bio page: one small container, one
SQLite file, an online admin editor, no build step, and **exactly two runtime
dependencies**.

## Commands

```bash
npm install
npm run seed      # create the database + demo profile
npm start         # http://localhost:3000   (port 3000 may be taken locally)
npm run dev       # watch mode
npm test          # node:test suite
npm run typecheck # tsc --noEmit
```

Run **`npm run typecheck` and `npm test`** before considering any change done.

## The rules that matter most

1. **Two runtime dependencies** (`hono`, `@hono/node-server`). Prefer the Node
   standard library.
2. **No build step.** TypeScript runs directly on Node ≥ 24; only *erasable*
   syntax (`erasableSyntaxOnly`). Keep TypeScript strict.
3. **Never commit** `data/`, `.env`, secrets, or personal content — the repo is
   public.
4. **Escape or validate every output**: `escapeHtml`, `sanitizeCss`, parameterised
   SQL, `isHttpUrl`, `isSafeAssetRef`.
5. **No inline scripts.** Client behaviour lives in an external `public/js/*.js`
   file (`script-src 'self'`).
6. **Theme settings** use the `settings` key/value table — no migration needed.
7. **Keep the container hardened**: non-root, read-only rootfs, no published ports.
8. **Branch → PR → CI → merge.** Never push to `main` directly. One concern per
   commit, Conventional Commits.

The full list, with rationale, is in
[docs/governance/invariants.md](docs/governance/invariants.md).

## When you change something

- **A new route** → `src/app.ts` (rendering in `src/render.ts`, data in `src/db.ts`,
  validation in `src/validate.ts`).
- **A new theme setting** → `types.ts` + `defaults.ts` + `db.ts` + the admin form +
  `seed-file.ts`. No migration.
- **New UI** → reuse the existing `admin-*` classes; tokens, not literals. See
  [ui-guidelines.md](docs/governance/ui-guidelines.md).
- **New client behaviour** → an external file in `public/js/`.
- **New behaviour** → a test in `tests/`, following
  [testing.md](docs/governance/testing.md).

If a change invalidates something in these documents, update the document in the
same PR.
