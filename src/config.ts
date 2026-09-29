import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  port: number;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  /** Password from the environment, or undefined to generate one on first run. */
  adminPassword: string | undefined;
  /** Session secret from the environment, or undefined to generate and persist one. */
  sessionSecret: string | undefined;
  secureCookies: boolean;
  baseUrl: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(env.DATA_DIR ?? './data');
  const uploadsDir = resolve(dataDir, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  return {
    port: parsePort(env.PORT),
    dataDir,
    dbPath: resolve(dataDir, 'profile.db'),
    uploadsDir,
    adminPassword: nonEmpty(env.ADMIN_PASSWORD),
    sessionSecret: nonEmpty(env.SESSION_SECRET),
    // Secure by default in production (the container sets NODE_ENV=production);
    // local development over plain HTTP opts out explicitly.
    secureCookies:
      env.SECURE_COOKIES !== undefined
        ? env.SECURE_COOKIES === 'true'
        : env.NODE_ENV === 'production',
    baseUrl: nonEmpty(env.BASE_URL),
  };
}

function parsePort(value: string | undefined): number {
  const raw = value ?? '3000';
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid PORT: ${raw}`);
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) throw new Error(`Invalid PORT: ${raw}`);
  return port;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}
