# Workflow

How changes move from an idea to `main`. The short version: **branch → PR → CI →
merge.** Never push to `main` directly.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), imperative mood,
lowercase subject, no trailing period, ~72 characters.

```
<type>(<optional scope>): <subject>

<body: what and why, wrapped at ~72 columns>
```

| Type | Use |
|---|---|
| `feat` | A user-visible feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `build(deps)` | Dependency bumps (Dependabot uses this) |
| `chore` | Tooling, housekeeping |
| `refactor` | Behaviour-preserving restructure |

Examples from the history:

```
feat: visitor theme selection (default mode + switcher)
fix: admin UI tweaks (colour swatches, backup/restore sections)
docs: document the admin panel and link icons
build(deps): bump actions/setup-node from 4 to 7 (#3)
```

Rules:

- **One concern per commit.** If the subject needs "and", it is probably two
  commits. (When a single change genuinely spans concerns — e.g. a feature plus
  the UI it needs — split what you can and keep the rest coherent.)
- **Body explains *why*.** The diff shows what changed; the body says why.
- **Never commit** `data/`, `.env`, secrets, or personal content.
- **Do not commit generated files** — there is no build output to commit.

## Branches

Short-lived, typed, kebab-case:

```
feat/<slug>      fix/<slug>      docs/<slug>      chore/<slug>
```

Base off an up-to-date `main`; delete the branch once merged.

## Pull requests

1. Push the branch and open a PR (the template asks What / Why / How / Checklist).
2. **CI must pass** — `.github/workflows/ci.yml` runs `npm run typecheck` and
   `npm test` on every PR.
3. Merge through the PR. `main` is the source of truth; do not bypass it.

**Merge strategy.** The history is **linear**. Feature/fix PRs are merged with a
**rebase merge** so each commit lands on `main` in order without a merge node.
Dependabot PRs are squash-merged (hence the `(#N)` suffix on those commits).

> Branch protection note: even for a trivial change, use a branch and a PR. A
> green CI run and a reviewable diff are the point.

## Versioning and releases

- **Semantic Versioning**; the version lives in `package.json`.
- **CHANGELOG.md** follows [Keep a Changelog](https://keepachangelog.com/): keep
  an `## [Unreleased]` section, then cut it into `## [x.y.z] — YYYY-MM-DD` at
  release time.
- A release is: bump the version, finalise the changelog, tag `vX.Y.Z`, and
  publish a GitHub release.

## Dependency updates

- **Dependabot** opens PRs for GitHub Actions and npm packages. Merge the ones
  that keep the pinned runtime (Node 24) intact; close the ones that conflict
  with it (e.g. a `node:26-alpine` base or a TypeScript major that breaks
  `erasableSyntaxOnly`).
- **Runtime dependency bumps are rare by design** — see
  [invariants.md](invariants.md#1-exactly-two-runtime-dependencies).

## Local checks before pushing

```bash
npm run typecheck
npm test
```

Both must be clean. UI changes should also be eyeballed at desktop and mobile
widths (see [ui-guidelines.md](ui-guidelines.md)).

## Deployment

Deployment is separate from the git flow — see
[DEPLOYMENT.md](../DEPLOYMENT.md). The container is built from the repo (no build
step) and runs behind a reverse proxy.
