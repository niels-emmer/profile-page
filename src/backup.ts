import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { getEntity, getProfile, getTheme, listLinks } from './db.ts';
import { applySeed, parseSeed, validateSeed } from './seed-file.ts';
import { createTar, readTar, type TarEntry } from './tar.ts';
import type { Link, NewLink, SeedFile } from './types.ts';
import { detectImageType, isSvg, sanitizeSvg } from './upload.ts';

export const BACKUP_SEED_NAME = 'seed.json';
export const BACKUP_UPLOADS_PREFIX = 'uploads/';
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;

export class BackupError extends Error {}

function toNewLink(link: Link): NewLink {
  return {
    text: link.text,
    url: link.url,
    newWindow: link.newWindow,
    iconType: link.iconType,
    iconValue: link.iconValue,
    iconColor: link.iconColor,
    textColor: link.textColor,
    colorMode: link.colorMode,
    colorFrom: link.colorFrom,
    colorTo: link.colorTo,
    borderColor: link.borderColor,
  };
}

/** Snapshot the profile, theme, links, and every uploaded file as a .tar.gz. */
export function buildBackup(db: DatabaseSync, uploadsDir: string): Buffer {
  const seed: SeedFile = {
    profile: getProfile(db),
    theme: getTheme(db),
    entity: getEntity(db),
    links: listLinks(db).map(toNewLink),
  };

  const entries: TarEntry[] = [
    { name: BACKUP_SEED_NAME, data: Buffer.from(`${JSON.stringify(seed, null, 2)}\n`, 'utf8') },
  ];

  if (existsSync(uploadsDir)) {
    for (const file of readdirSync(uploadsDir).sort()) {
      const path = join(uploadsDir, file);
      if (!statSync(path).isFile()) continue;
      entries.push({ name: `${BACKUP_UPLOADS_PREFIX}${file}`, data: readFileSync(path) });
    }
  }

  return gzipSync(createTar(entries));
}

/** macOS AppleDouble/resource-fork entries and .DS_Store are ignored. */
function isJunkEntry(name: string): boolean {
  return name.split('/').some((segment) => segment.startsWith('._') || segment === '.DS_Store');
}

function findSeedEntry(entries: TarEntry[]): TarEntry | undefined {
  const canonical = entries.find((entry) => entry.name === BACKUP_SEED_NAME);
  if (canonical !== undefined) return canonical;
  // Compatibility with hand-made archives: a single root-level *.json file.
  const roots = entries.filter((entry) => !entry.name.includes('/') && entry.name.endsWith('.json'));
  return roots.length === 1 ? roots[0] : undefined;
}

function sanitizeUpload(name: string, data: Buffer): Buffer {
  if (detectImageType(data) !== undefined) return data;
  if (isSvg(data)) return Buffer.from(sanitizeSvg(data.toString('utf8')), 'utf8');
  throw new BackupError(`Unsupported file in archive: ${name}`);
}

/**
 * Validate an archive and, only if it is fully valid, replace the profile,
 * theme, links, and uploaded files. Nothing is written until every entry has
 * passed validation.
 */
export function restoreBackup(db: DatabaseSync, uploadsDir: string, archive: Buffer): void {
  if (archive.length === 0) throw new BackupError('The uploaded archive is empty.');
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new BackupError('The archive exceeds the 50 MB limit.');
  }

  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_EXTRACTED_BYTES });
  } catch {
    throw new BackupError('The archive is not a valid gzip file.');
  }

  let entries: TarEntry[];
  try {
    entries = readTar(tar);
  } catch (error) {
    throw new BackupError(error instanceof Error ? error.message : 'The archive is malformed.');
  }

  const usable = entries.filter((entry) => !isJunkEntry(entry.name));
  const seedEntry = findSeedEntry(usable);
  if (seedEntry === undefined) {
    throw new BackupError(`The archive is missing ${BACKUP_SEED_NAME}.`);
  }

  let seed: SeedFile;
  try {
    seed = parseSeed(JSON.parse(seedEntry.data.toString('utf8')));
    validateSeed(seed);
  } catch (error) {
    throw new BackupError(error instanceof Error ? error.message : 'The seed is invalid.');
  }

  const files = usable
    .filter((entry) => entry.name.startsWith(BACKUP_UPLOADS_PREFIX))
    .map((entry) => {
      const name = entry.name.slice(BACKUP_UPLOADS_PREFIX.length);
      if (name.length === 0 || basename(name) !== name) {
        throw new BackupError(`Unsafe upload path: ${entry.name}`);
      }
      return { name, data: sanitizeUpload(name, entry.data) };
    });

  // Write the new files first, then drop anything the backup does not contain,
  // so a failure never leaves the uploads directory empty.
  mkdirSync(uploadsDir, { recursive: true });
  const keep = new Set(files.map((file) => file.name));
  for (const file of files) writeFileSync(join(uploadsDir, file.name), file.data);
  for (const existing of readdirSync(uploadsDir)) {
    if (!keep.has(existing)) rmSync(join(uploadsDir, existing), { force: true });
  }

  applySeed(db, seed);
}
