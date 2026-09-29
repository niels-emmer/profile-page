import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { ensureSeeded, openDatabase } from './db.ts';
import { applySeed, parseSeed } from './seed-file.ts';

/**
 * Create the empty default profile. Idempotent: existing content is never
 * overwritten, so it is safe to run on every boot.
 *
 * Pass a seed file to replace the profile, theme, and links instead:
 *   node src/seed.ts data/personal-seed.json
 */
const config = loadConfig();
const db = openDatabase(config);
ensureSeeded(db);

const seedPath = process.argv[2];
if (seedPath === undefined) {
  console.log(`Seeded (if empty): ${config.dbPath}`);
} else {
  const seed = parseSeed(JSON.parse(readFileSync(resolve(seedPath), 'utf8')));
  applySeed(db, seed);
  console.log(`Applied seed ${seedPath} -> ${config.dbPath}`);
}
