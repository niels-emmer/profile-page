import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  RateLimiter,
  createSessionToken,
  csrfMatches,
  ensureAuth,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

test('hashPassword / verifyPassword round-trip', () => {
  const salt = 'a-random-salt';
  const hash = hashPassword('correct horse battery staple', salt);
  assert.equal(verifyPassword('correct horse battery staple', hash, salt), true);
  assert.equal(verifyPassword('wrong password', hash, salt), false);
});

test('verifyPassword rejects a malformed stored hash', () => {
  assert.equal(verifyPassword('anything', 'deadbeef', 'salt'), false);
});

test('session token round-trip', () => {
  const token = createSessionToken('secret');
  assert.equal(verifySessionToken('secret', token), true);
});

test('session token rejects tampering and wrong secrets', () => {
  const token = createSessionToken('secret');
  assert.equal(verifySessionToken('secret', `${token}x`), false);
  assert.equal(verifySessionToken('other-secret', token), false);
  assert.equal(verifySessionToken('secret', 'garbage'), false);
  assert.equal(verifySessionToken('secret', ''), false);
});

test('session token expires after the TTL', () => {
  const now = Date.now();
  const token = createSessionToken('secret', now);
  assert.equal(verifySessionToken('secret', token, now + 6 * DAY_MS), true);
  assert.equal(verifySessionToken('secret', token, now + 8 * DAY_MS), false);
});

test('csrfMatches compares constant-time and rejects empties', () => {
  assert.equal(csrfMatches('abc123', 'abc123'), true);
  assert.equal(csrfMatches('abc123', 'abc124'), false);
  assert.equal(csrfMatches(undefined, 'abc123'), false);
  assert.equal(csrfMatches('abc123', ''), false);
});

test('RateLimiter blocks after the maximum number of events', () => {
  const limiter = new RateLimiter(3, 1000);
  assert.equal(limiter.isBlocked('ip', 1000), false);
  limiter.record('ip', 1000);
  limiter.record('ip', 1000);
  limiter.record('ip', 1000);
  assert.equal(limiter.isBlocked('ip', 1000), true);
  assert.equal(limiter.isBlocked('other-ip', 1000), false);
});

test('RateLimiter window slides', () => {
  const limiter = new RateLimiter(2, 1000);
  limiter.record('ip', 0);
  limiter.record('ip', 500);
  assert.equal(limiter.isBlocked('ip', 900), true);
  assert.equal(limiter.isBlocked('ip', 1600), false);
});

test('RateLimiter reset clears the key', () => {
  const limiter = new RateLimiter(1, 1000);
  limiter.record('ip', 0);
  assert.equal(limiter.isBlocked('ip', 0), true);
  limiter.reset('ip');
  assert.equal(limiter.isBlocked('ip', 0), false);
});

test('ensureAuth rotates the session secret when the password changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-auth-'));
  try {
    const first = loadConfig({ DATA_DIR: dir, ADMIN_PASSWORD: 'first-password' });
    const db = openDatabase(first);
    const before = ensureAuth(db, first);
    const token = createSessionToken(before.sessionSecret);

    const second = loadConfig({ DATA_DIR: dir, ADMIN_PASSWORD: 'second-password' });
    const after = ensureAuth(db, second);
    assert.notEqual(after.sessionSecret, before.sessionSecret);
    assert.equal(verifySessionToken(after.sessionSecret, token), false);
    assert.equal(verifyPassword('second-password', after.passwordHash, after.passwordSalt), true);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureAuth keeps the session secret when the password is unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-auth-'));
  try {
    const config = loadConfig({ DATA_DIR: dir, ADMIN_PASSWORD: 'same-password' });
    const db = openDatabase(config);
    const before = ensureAuth(db, config);
    const after = ensureAuth(db, config);
    assert.equal(after.sessionSecret, before.sessionSecret);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
