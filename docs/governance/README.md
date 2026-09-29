# Governance

The rules and context for developing `profile-page` consistently. This library is
written for **both humans and AI agents** — everything here is grounded in the
actual code, commits, and design decisions of this repository.

> The repository is **public**. Never put personal data, secrets, or internal
> notes in these documents (or anywhere in the repo).

## The documents

| Document | Answers |
|---|---|
| [invariants.md](invariants.md) | What must never change, and why. **Read this first.** |
| [architecture.md](architecture.md) | How the system is built, and where to add code. |
| [style-guide.md](style-guide.md) | How to write code that looks like the rest of it. |
| [ui-guidelines.md](ui-guidelines.md) | The design system: tokens, fonts, components, and UI decisions. |
| [testing.md](testing.md) | How to test, and what to test. |
| [workflow.md](workflow.md) | Commits, branches, PRs, CI, releases. |
| [decisions.md](decisions.md) | Locked architecture decisions (ADRs) with rationale. |

Related, outside this folder:

- [../API.md](../API.md) — routes, data model, seed format, discovery endpoints.
- [../DEPLOYMENT.md](../DEPLOYMENT.md) — reverse proxy, backups, upgrades.
- [../../SECURITY.md](../../SECURITY.md) — threat model and controls.
- [../THIRD-PARTY.md](../THIRD-PARTY.md) — bundled assets, fonts, licences.
- [../PLAN.md](../PLAN.md) — build plan and exact-copy verification record.
- [../../CONTRIBUTING.md](../../CONTRIBUTING.md) — the human-facing short version.

## Quick reference

The rules you will most often need, at a glance:

- **Two runtime dependencies.** `hono` + `@hono/node-server`. Prefer the stdlib.
- **No build step.** TypeScript runs directly on Node ≥ 24; erasable syntax only.
- **Strict TypeScript stays strict.** Never loosen a `tsconfig` flag.
- **Never commit** `data/`, `.env`, secrets, or personal content.
- **Escape or validate every output** — `escapeHtml`, `sanitizeCss`,
  parameterised SQL, `isHttpUrl`, `isSafeAssetRef`.
- **No inline scripts.** New client behaviour is an external file in `public/js/`.
- **Theme settings** go in the `settings` key/value table — no migration.
- **The container stays hardened.** No published ports, non-root, read-only rootfs.
- **`npm run typecheck` and `npm test` must pass.**
- **Branch → PR → CI → merge.** Never push to `main` directly.
- **One concern per commit**, Conventional Commits.

## How to use this library

**Starting a change.** Skim [invariants.md](invariants.md) and the relevant
section of [architecture.md](architecture.md). For UI work, read
[ui-guidelines.md](ui-guidelines.md).

**Reviewing a change.** Check it against the invariants; confirm style, tests, and
the commit/PR conventions.

**If something here is wrong or stale**, fix it in the same PR as the code change
that invalidated it. These documents are part of the codebase.
