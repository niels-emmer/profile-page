# Contributing

Thanks for your interest. This is a deliberately small, single-user project, so
please keep changes focused and dependency-free where possible.

## Before you start

- For anything non-trivial, open an issue first so we can agree on the approach.
- Security issues must **not** be reported as public issues — see
  [SECURITY.md](SECURITY.md).

## Development setup

Requires Node.js >= 24 (the app runs TypeScript directly, with no build step).

```bash
npm install
npm run seed      # create the database and demo profile
npm start         # http://localhost:3000
npm run dev       # watch mode
```

If port 3000 is taken, set `PORT` (e.g. `PORT=3999 npm start`).

## Checks

Run both before opening a pull request:

```bash
npm run typecheck
npm test
```

## Guidelines

- **No new runtime dependencies** without a strong justification. The project
  ships with exactly two (`hono`, `@hono/node-server`) and would like to keep it
  that way. Prefer the Node standard library.
- **Match the existing style.** TypeScript is strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `erasableSyntaxOnly`); keep it that way.
- **Add tests** for behaviour changes. The suite uses `node:test`.
- **Never commit personal data or secrets.** Profile content lives in the
  gitignored `data/` directory.
- **One concern per commit**, with a clear message.

## Pull requests

Fill in the pull request template. CI runs typecheck and tests on every PR.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
