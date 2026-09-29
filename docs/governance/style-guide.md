# Style guide

How the code is written. The goal is consistency a forker can match without
guessing. When in doubt, open a neighbouring file and copy its shape.

## Formatting

Enforced partly by [.editorconfig](../../.editorconfig); the rest is convention.

- **Indentation** — 2 spaces, never tabs.
- **Line endings** — LF; files end with a newline; no trailing whitespace
  (Markdown is exempt from the trailing-whitespace rule).
- **Quotes** — single quotes for strings and imports.
- **Semicolons** — always.
- **Trailing commas** — in multi-line arrays, objects, parameters, and arguments.
- **Line width** — aim for ~100 columns. Long template-literal HTML lines are
  allowed to exceed it; do not break a template in ways that change its output.
- **Braces** — always, even for single statements.

There is no Prettier/ESLint config — the codebase is small and the conventions are
simple. Do not add a formatter as a dependency.

## Imports

ESM only, with explicit `.ts` extensions (required by Node's resolver and
`allowImportingTsExtensions`):

```ts
import { createLink, getTheme } from './db.ts';
import type { Link, ThemeSettings } from './types.ts';
```

- **`import type`** for type-only imports — required by `verbatimModuleSyntax`.
- **Relative paths** (`./db.ts`) — there is no path aliasing.
- Order: external packages first, then local modules; alphabetise within a group
  when it is not disruptive.

## Naming

| Kind | Convention | Example |
|---|---|---|
| Functions, variables | `camelCase` | `renderAdminPage`, `csrfOk` |
| Types, interfaces | `PascalCase` | `ThemeSettings`, `BackgroundSettings` |
| Constants | `SCREAMING_SNAKE_CASE` | `COLOR_SCHEMES`, `SESSION_TTL_SECONDS` |
| Files | `kebab-case` | `seed-file.ts` |
| Private helpers | `camelCase`, not exported | `hexToRgb`, `moveOrder` |
| CSS classes (admin) | `admin-` prefix, kebab-case, BEM-ish modifiers | `admin-card`, `admin-button--danger` |
| CSS classes (public) | LinkStack-compatible names | `.button`, `.container`, `.icon` |

Domain types live in `types.ts`; a variant is a union, never an `enum`
(`erasableSyntaxOnly`):

```ts
export type ThemeMode = 'light' | 'dark' | 'system';
```

## Functions and modules

- **Named exports only** — no default exports.
- **Factory functions over globals** — `createApp(deps)` takes its dependencies
  so tests can inject a throwaway database.
- **Small and single-purpose.** A function that needs an "and" in its name is two
  functions.
- **Early returns** for guard clauses; avoid deep nesting.
- **Classes only for stateful objects** (`RateLimiter`). Everything else is
  functions and plain objects.
- **Pure where possible.** `render.ts` and `validate.ts` have no I/O; that is what
  makes them trivially testable.

## Types

- Prefer explicit parameter and return types on exported functions.
- Model "optional" with `| null` when the value is stored (`iconColor: string | null`),
  and with `?` when a key may be absent (`error?: string`). `exactOptionalPropertyTypes`
  is on — do not mix them up.
- `noUncheckedIndexedAccess` is on, so array access yields `T | undefined`. Handle
  it (`const first = ids[0]; if (first === undefined) return …`) rather than
  asserting with `!` unless the invariant is locally obvious.

## Comments

- **Doc comments** (`/** … */`) on exported functions and non-obvious types.
- **Section dividers** inside long files:
  ```ts
  /* ------------------------------- admin page ---------------------------- */
  ```
- **Explain *why*, not *what*.** The code says what it does; a comment should add
  the reason, the constraint, or the trap avoided. Good example, from
  `backgroundValue`:
  ```ts
  // CSS cannot set the opacity of a background-image, so a translucent veil of
  // the colour is drawn over it.
  ```
- **No commented-out code.** Delete it; git remembers.

## Error handling

- **Throw typed errors** for expected failures: `UploadError`, `BackupError`.
- **Catch at the route boundary.** A handler catches, then redirects with
  `?error=<encoded message>`; the admin renders it in a banner. Never let an
  exception become a 500 on a user action.
- **Validate before you write.** Parse and check the whole input first; only then
  mutate the database or filesystem (see `restoreBackup`).
- **Never swallow silently.** The one permitted empty catch is a best-effort
  client-side fetch whose failure is already covered by a no-JS fallback
  (`admin.js` drag reorder).

## HTML generation

All HTML is template literals in `render.ts`:

- **Escape everything interpolated** with `escapeHtml` (handles `& < > " '`).
- **Sanitise CSS** with `sanitizeCss` (`[a-zA-Z0-9#(),.%\s/-]`).
- **Build reusable snippets as small helpers** (`field`, `colorField`,
  `cardHeader`, `selectField`, `backgroundSection`) rather than repeating markup.
- **Emit JSON via `JSON.stringify` then replace `<` with `\u003c`** so a value can
  never break out of a `<script>` element (see the JSON-LD block).
- **Attribute order** — put the meaningful attributes (`method`, `action`, `name`,
  `value`) first; keep `class` last-ish and stable.

## CSS

Two hand-written stylesheets, no framework, no preprocessor.

- **Design tokens** are CSS custom properties at the top of each file; reference
  them (`hsl(var(--border))`) instead of hard-coding colours.
- **Namespace admin classes** with `admin-`; the public page keeps its
  LinkStack-compatible names.
- **Reuse existing patterns.** A new card, field, button, or subsection should
  use the classes already defined, not new bespoke ones. See
  [ui-guidelines.md](ui-guidelines.md).
- **No `!important`.** Fix specificity properly.
- **Scope resets.** The public `style.css` has a global `button` rule; the admin
  stylesheet overrides it deliberately. Be aware of cross-surface leakage.
- **Respect `prefers-reduced-motion`** for any animation.

## Tests

See [testing.md](testing.md). In short: `node:test` + `assert/strict`, one
behaviour per test, descriptive names, no mocking framework, isolated temp DB per
test.
