import { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';
import { DEFAULT_BACKGROUND, DEFAULT_PROFILE, DEFAULT_SEED, DEFAULT_THEME } from './defaults.ts';
import type { BackgroundSettings, Link, NewLink, Profile, ThemeSettings } from './types.ts';
import {
  isBackgroundAttachment,
  isBackgroundPosition,
  isBackgroundRepeat,
  isBackgroundSize,
} from './validate.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  name        TEXT NOT NULL DEFAULT '',
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_path TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  position    INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  new_window  INTEGER NOT NULL DEFAULT 1,
  icon_type   TEXT NOT NULL DEFAULT 'fa',
  icon_value  TEXT NOT NULL DEFAULT '',
  icon_color  TEXT,
  text_color  TEXT NOT NULL DEFAULT '#ffffff',
  color_mode  TEXT NOT NULL DEFAULT 'solid',
  color_from  TEXT NOT NULL DEFAULT '#0085ff',
  color_to    TEXT NOT NULL DEFAULT '#0085ff',
  border_color TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  session_secret TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDatabase(config: Config): DatabaseSync {
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/* ------------------------------- profile ------------------------------- */

interface ProfileRow {
  name: string;
  tagline: string;
  description: string;
  avatar_path: string | null;
}

export function getProfile(db: DatabaseSync): Profile {
  const row = db
    .prepare('SELECT name, tagline, description, avatar_path FROM profile WHERE id = 1')
    .get() as ProfileRow | undefined;
  if (row === undefined) return { ...DEFAULT_PROFILE };
  return {
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    avatarPath: row.avatar_path,
  };
}

export function saveProfile(db: DatabaseSync, profile: Profile): void {
  db.prepare(
    `INSERT INTO profile (id, name, tagline, description, avatar_path, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       tagline = excluded.tagline,
       description = excluded.description,
       avatar_path = excluded.avatar_path,
       updated_at = datetime('now')`,
  ).run(profile.name, profile.tagline, profile.description, profile.avatarPath);
}

/* -------------------------------- links -------------------------------- */

interface LinkRow {
  id: number;
  position: number;
  text: string;
  url: string;
  new_window: number;
  icon_type: string;
  icon_value: string;
  icon_color: string | null;
  text_color: string;
  color_mode: string;
  color_from: string;
  color_to: string;
  border_color: string | null;
}

function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    position: row.position,
    text: row.text,
    url: row.url,
    newWindow: row.new_window === 1,
    iconType: row.icon_type === 'image' ? 'image' : 'fa',
    iconValue: row.icon_value,
    iconColor: row.icon_color,
    textColor: row.text_color,
    colorMode: row.color_mode === 'gradient' ? 'gradient' : 'solid',
    colorFrom: row.color_from,
    colorTo: row.color_to,
    borderColor: row.border_color,
  };
}

export function listLinks(db: DatabaseSync): Link[] {
  const rows = db
    .prepare('SELECT * FROM links ORDER BY position ASC, id ASC')
    .all() as unknown as LinkRow[];
  return rows.map(toLink);
}

export function getLink(db: DatabaseSync, id: number): Link | undefined {
  const row = db.prepare('SELECT * FROM links WHERE id = ?').get(id) as unknown as LinkRow | undefined;
  return row === undefined ? undefined : toLink(row);
}

export function createLink(db: DatabaseSync, link: NewLink): number {
  const next = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM links')
    .get() as { pos: number };
  const result = db
    .prepare(
      `INSERT INTO links
         (position, text, url, new_window, icon_type, icon_value, icon_color,
          text_color, color_mode, color_from, color_to, border_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      next.pos,
      link.text,
      link.url,
      link.newWindow ? 1 : 0,
      link.iconType,
      link.iconValue,
      link.iconColor,
      link.textColor,
      link.colorMode,
      link.colorFrom,
      link.colorTo,
      link.borderColor,
    );
  return Number(result.lastInsertRowid);
}

export function updateLink(db: DatabaseSync, id: number, link: NewLink): void {
  db.prepare(
    `UPDATE links SET
       text = ?, url = ?, new_window = ?, icon_type = ?, icon_value = ?,
       icon_color = ?, text_color = ?, color_mode = ?, color_from = ?, color_to = ?,
       border_color = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    link.text,
    link.url,
    link.newWindow ? 1 : 0,
    link.iconType,
    link.iconValue,
    link.iconColor,
    link.textColor,
    link.colorMode,
    link.colorFrom,
    link.colorTo,
    link.borderColor,
    id,
  );
}

export function deleteLink(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
}

/** Persist a new ordering; `ids` is the full list of link ids in display order. */
export function reorderLinks(db: DatabaseSync, ids: number[]): void {
  const stmt = db.prepare('UPDATE links SET position = ? WHERE id = ?');
  ids.forEach((id, index) => stmt.run(index, id));
}

/* ------------------------------ settings ------------------------------- */

export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function getBackground(db: DatabaseSync, key: string): BackgroundSettings {
  const imagePath = getSetting(db, `${key}.imagePath`);
  const size = getSetting(db, `${key}.size`);
  const position = getSetting(db, `${key}.position`);
  const repeat = getSetting(db, `${key}.repeat`);
  const attachment = getSetting(db, `${key}.attachment`);
  return {
    imagePath: imagePath !== undefined && imagePath.length > 0 ? imagePath : null,
    size: isBackgroundSize(size) ? size : DEFAULT_BACKGROUND.size,
    position: isBackgroundPosition(position) ? position : DEFAULT_BACKGROUND.position,
    repeat: isBackgroundRepeat(repeat) ? repeat : DEFAULT_BACKGROUND.repeat,
    attachment: isBackgroundAttachment(attachment) ? attachment : DEFAULT_BACKGROUND.attachment,
  };
}

function saveBackground(db: DatabaseSync, key: string, bg: BackgroundSettings): void {
  setSetting(db, `${key}.imagePath`, bg.imagePath ?? '');
  setSetting(db, `${key}.size`, bg.size);
  setSetting(db, `${key}.position`, bg.position);
  setSetting(db, `${key}.repeat`, bg.repeat);
  setSetting(db, `${key}.attachment`, bg.attachment);
}

export function getTheme(db: DatabaseSync): ThemeSettings {
  return {
    backgroundDark: getSetting(db, 'theme.backgroundDark') ?? DEFAULT_THEME.backgroundDark,
    backgroundLight: getSetting(db, 'theme.backgroundLight') ?? DEFAULT_THEME.backgroundLight,
    textDark: getSetting(db, 'theme.textDark') ?? DEFAULT_THEME.textDark,
    textLight: getSetting(db, 'theme.textLight') ?? DEFAULT_THEME.textLight,
    accentColor: getSetting(db, 'theme.accentColor') ?? DEFAULT_THEME.accentColor,
    faviconPath: getSetting(db, 'theme.faviconPath') ?? DEFAULT_THEME.faviconPath,
    backgroundImageDark: getBackground(db, 'theme.backgroundImageDark'),
    backgroundImageLight: getBackground(db, 'theme.backgroundImageLight'),
  };
}

export function saveTheme(db: DatabaseSync, theme: ThemeSettings): void {
  setSetting(db, 'theme.backgroundDark', theme.backgroundDark);
  setSetting(db, 'theme.backgroundLight', theme.backgroundLight);
  setSetting(db, 'theme.textDark', theme.textDark);
  setSetting(db, 'theme.textLight', theme.textLight);
  setSetting(db, 'theme.accentColor', theme.accentColor);
  setSetting(db, 'theme.faviconPath', theme.faviconPath);
  saveBackground(db, 'theme.backgroundImageDark', theme.backgroundImageDark);
  saveBackground(db, 'theme.backgroundImageLight', theme.backgroundImageLight);
}

/**
 * Populate a representative default profile on first run. Idempotent: once a
 * profile row exists, nothing is touched, so later edits (including deleting
 * every link) are preserved across restarts.
 */
export function ensureSeeded(db: DatabaseSync): void {
  const hasProfile = db.prepare('SELECT id FROM profile WHERE id = 1').get() !== undefined;
  if (hasProfile) return;
  saveProfile(db, DEFAULT_SEED.profile);
  saveTheme(db, DEFAULT_SEED.theme);
  for (const link of DEFAULT_SEED.links) createLink(db, link);
}

/* -------------------------------- auth --------------------------------- */

export interface AuthRecord {
  passwordHash: string;
  passwordSalt: string;
  sessionSecret: string;
}

export function getAuth(db: DatabaseSync): AuthRecord | undefined {
  const row = db
    .prepare('SELECT password_hash, password_salt, session_secret FROM auth WHERE id = 1')
    .get() as { password_hash: string; password_salt: string; session_secret: string } | undefined;
  if (row === undefined) return undefined;
  return {
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    sessionSecret: row.session_secret,
  };
}

export function saveAuth(db: DatabaseSync, auth: AuthRecord): void {
  db.prepare(
    `INSERT INTO auth (id, password_hash, password_salt, session_secret, updated_at)
     VALUES (1, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       password_hash = excluded.password_hash,
       password_salt = excluded.password_salt,
       session_secret = excluded.session_secret,
       updated_at = datetime('now')`,
  ).run(auth.passwordHash, auth.passwordSalt, auth.sessionSecret);
}
