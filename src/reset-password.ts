/**
 * Reset the admin password from the command line.
 *
 * Usage:  node src/reset-password.ts [new-password]
 * Default: 'changeme' (the bootstrap password; the next /admin visit forces a change)
 *
 * Also rotates the session secret, signing out every session.
 *
 * In the container (forgot your password?):
 *   docker exec -it profile-page node src/reset-password.ts
 *   docker exec -it profile-page node src/reset-password.ts 'my-new-password'
 */
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';
import { saveAuth } from './db.ts';

const dbPath = `${process.env.DATA_DIR ?? './data'}/profile.db`;
const password = process.argv[2] ?? 'changeme';

const db = new DatabaseSync(dbPath);
const hasAuth = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth'")
  .get() !== undefined;
if (!hasAuth) {
  console.error('No database found — the app will create one with the default password on first run.');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
saveAuth(db, {
  passwordHash: hashPassword(password, salt),
  passwordSalt: salt,
  sessionSecret: randomBytes(32).toString('hex'),
});
db.close();
console.log(`Admin password reset to: ${password}`);
console.log('Restart the app for the change to take effect: docker compose restart profile-page');