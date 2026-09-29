import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';
import { getAuth, saveAuth, type AuthRecord } from './db.ts';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The bootstrap password on a fresh install; the user is forced to change it. */
export const DEFAULT_PASSWORD = 'changeme';

export const SESSION_COOKIE = 'session';
export const CSRF_COOKIE = 'csrf';
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/* ------------------------------ passwords ------------------------------ */

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const candidate = Buffer.from(hashPassword(password, salt), 'hex');
  return timingSafeEqual(candidate, expected);
}

/** True while the account still uses the bootstrap password and must change it. */
export function isDefaultPassword(auth: AuthRecord): boolean {
  return verifyPassword(DEFAULT_PASSWORD, auth.passwordHash, auth.passwordSalt);
}

/* ------------------------------- sessions ------------------------------ */

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Token format: `<expiry-ms>.<hmac-sha256-hex>`. */
export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expiry = String(now + SESSION_TTL_MS);
  return `${expiry}.${sign(secret, expiry)}`;
}

export function verifySessionToken(secret: string, token: string, now: number = Date.now()): boolean {
  const separator = token.indexOf('.');
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(secret, payload);
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  const expiry = Number.parseInt(payload, 10);
  return Number.isFinite(expiry) && expiry > now;
}

/* --------------------------------- CSRF -------------------------------- */

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function csrfMatches(cookieToken: string | undefined, formToken: string): boolean {
  if (cookieToken === undefined || formToken.length === 0) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(formToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------ rate limit ----------------------------- */

/** Sliding-window limiter: at most `max` events per `windowMs` per key. */
export class RateLimiter {
  #events = new Map<string, number[]>();
  #max: number;
  #windowMs: number;

  constructor(max = 5, windowMs = 15 * 60 * 1000) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  isBlocked(key: string, now: number = Date.now()): boolean {
    return this.#prune(key, now).length >= this.#max;
  }

  record(key: string, now: number = Date.now()): void {
    const events = this.#prune(key, now);
    events.push(now);
    this.#events.set(key, events);
  }

  reset(key: string): void {
    this.#events.delete(key);
  }

  #prune(key: string, now: number): number[] {
    const events = (this.#events.get(key) ?? []).filter((at) => now - at < this.#windowMs);
    if (events.length === 0) this.#events.delete(key);
    else this.#events.set(key, events);
    return events;
  }
}

/* ------------------------------- bootstrap ----------------------------- */

/**
 * Ensure an auth record exists and matches the configured password.
 *
 * - `ADMIN_PASSWORD` (if set) wins: the stored hash is re-derived whenever it
 *   changes. Not set by default — the password is managed from the UI.
 * - Otherwise a fresh install starts with the `changeme` bootstrap password,
 *   and the first visit to `/admin` forces the user to pick their own.
 * - `SESSION_SECRET` wins over the stored secret; otherwise one is generated.
 */
export function ensureAuth(db: DatabaseSync, config: Config): AuthRecord {
  const existing = getAuth(db);
  const sessionSecret =
    config.sessionSecret ?? existing?.sessionSecret ?? randomBytes(32).toString('hex');

  if (config.adminPassword !== undefined) {
    const unchanged =
      existing !== undefined &&
      verifyPassword(config.adminPassword, existing.passwordHash, existing.passwordSalt);
    if (!unchanged) {
      const salt = randomBytes(16).toString('hex');
      // Rotate the session secret so sessions issued under the old password
      // are invalidated.
      const rotatedSecret = config.sessionSecret ?? randomBytes(32).toString('hex');
      saveAuth(db, {
        passwordHash: hashPassword(config.adminPassword, salt),
        passwordSalt: salt,
        sessionSecret: rotatedSecret,
      });
    } else if (existing.sessionSecret !== sessionSecret) {
      saveAuth(db, { ...existing, sessionSecret });
    }
  } else if (existing === undefined) {
    const salt = randomBytes(16).toString('hex');
    saveAuth(db, {
      passwordHash: hashPassword(DEFAULT_PASSWORD, salt),
      passwordSalt: salt,
      sessionSecret,
    });
  } else if (existing.sessionSecret !== sessionSecret) {
    saveAuth(db, { ...existing, sessionSecret });
  }

  const record = getAuth(db);
  if (record === undefined) throw new Error('Failed to initialise auth record');
  return record;
}
