# Testing

## Framework and commands

- **Runner:** Node's built-in `node:test` — no Jest/Vitest.
- **Assertions:** `node:assert/strict` (`assert.equal`, `assert.match`,
  `assert.deepEqual`, `assert.throws`).
- **Run:** `npm test` → `node --test tests/*.test.ts`.
- **Also run:** `npm run typecheck`. CI runs both on every PR.

No mocking library, no test framework, no coverage tool as a dependency. The suite
is fast enough (a couple of seconds) that it runs on every change.

## Structure

One file per area:

| File | Covers |
|---|---|
| `auth.test.ts` | hashing, session tokens, CSRF, rate limiter |
| `colors.test.ts` | presets, `readableTextColor`, `shade`, gradients |
| `upload.test.ts` | magic-byte detection, size caps, path handling |
| `render.test.ts` | HTML output, escaping, theme/background composition |
| `routes.test.ts` | every HTTP route via `app.request(...)` |
| `seed.test.ts` | seed parsing, validation, application |
| `tar.test.ts` | ustar round-trip, traversal rejection |
| `backup.test.ts` | backup/restore round-trips and rejection paths |
| `contact.test.ts` | vCard, contact JSON, WebFinger |
| `helpers.ts` | shared harness (not a test file) |

## Helpers (`tests/helpers.ts`)

- **`makeTestApp(options?)`** — boots an isolated app on a **throwaway temp
  directory**: fresh `openDatabase`, optional seeding, `ensureAuth`, then
  `createApp` with `publicDir` pointed at the real `public/`. Returns
  `{ app, config, db, cleanup }`.
- **`login(app, password?)`** — fetches `/login` for the CSRF cookie, posts the
  password, returns `{ csrf, session, response }`.
- **`formBody(fields)`** / **`FORM_HEADERS`** — build urlencoded POST bodies.
- **`cookiesFrom` / `cookieHeader`** — parse `Set-Cookie` into a cookie header.

Use `t.after(() => ctx.cleanup())` so the temp directory is always removed.

## Patterns

```ts
test('admin can set the default theme and enable the visitor switcher', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS };

  const res = await ctx.app.request('/admin/theme', {
    method: 'POST', headers,
    body: formBody({ csrf, defaultMode: 'dark', visitorToggle: 'on' }),
  });

  assert.equal(res.status, 302);
  assert.equal(getTheme(ctx.db).defaultMode, 'dark');
});
```

- **Drive routes through `app.request`**, never a live socket.
- **Assert on the observable result** — status, redirect location, database state,
  or rendered HTML — not on internals.
- **One behaviour per test**, with a name that reads as the requirement.
- **Isolation** — each test gets its own database; no shared mutable state.
- **Round-trip what you serialise** (tar, backup, seed) and test the rejection
  paths as well as the happy path.

## What to test

- **Every route** — auth redirects, CSRF rejection, validation errors, success.
- **Every validator** — the boundary values, not just the happy path (e.g. opacity
  `-1`, `101`, `500`; a non-hex colour; an external asset URL).
- **Rendering** — presence of the expected markup, escaping of hostile input, and
  the composed CSS value (`backgroundValue`).
- **Security behaviour** — CSRF on every state-changing POST (including
  `/logout`), unauthenticated `/admin` → `/login`, rate-limit trips.
- **Serialisation** — seed and backup round-trips, including "older file missing
  new fields" normalisation.

## Anti-patterns

- Do not add a mocking framework — inject a real dependency instead (the temp DB
  is the seam).
- Do not assert on exact whole-document HTML — assert on the fragment that
  matters.
- Do not test private helpers directly when a public route/renderer exercises
  them.
- Do not leave a test that "feels" right: reproduce the bug first, then fix, then
  watch the test go green.

## Adding tests

1. Pick the matching file (or add one, following the naming).
2. Use `makeTestApp` for anything that touches the app or database.
3. Assert the behaviour, not the implementation.
4. Run `npm test` and `npm run typecheck`.
