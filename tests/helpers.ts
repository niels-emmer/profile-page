import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.ts';
import { ensureAuth } from '../src/auth.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { ensureSeeded, openDatabase } from '../src/db.ts';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export interface TestApp {
  app: ReturnType<typeof createApp>;
  config: Config;
  db: DatabaseSync;
  cleanup: () => void;
}

/**
 * Boot an isolated app backed by a throwaway SQLite database. Seeded with the
 * default demo profile unless `seed: false` is passed.
 */
export function makeTestApp(
  options: { password?: string; secureCookies?: boolean; seed?: boolean } = {},
): TestApp {
  const dir = mkdtempSync(join(tmpdir(), 'pp-test-'));
  const config = loadConfig({
    DATA_DIR: dir,
    ADMIN_PASSWORD: options.password ?? 'test-password',
    SECURE_COOKIES: options.secureCookies === true ? 'true' : 'false',
  });
  const db = openDatabase(config);
  if (options.seed !== false) ensureSeeded(db);
  const auth = ensureAuth(db, config);
  const app = createApp({ config, db, auth, publicDir: PUBLIC_DIR });
  return {
    app,
    config,
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function cookiesFrom(res: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

export function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

export function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' };

/** Fetch the login page, then submit the password. Returns the session cookie. */
export async function login(
  app: TestApp['app'],
  password = 'test-password',
): Promise<{ csrf: string; session: string; response: Response }> {
  const page = await app.request('/login');
  const jar = cookiesFrom(page);
  const csrf = jar['csrf'] ?? '';
  const response = await app.request('/login', {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), ...FORM_HEADERS },
    body: formBody({ csrf, password }),
  });
  return { csrf, session: cookiesFrom(response)['session'] ?? '', response };
}

export { FORM_HEADERS };
