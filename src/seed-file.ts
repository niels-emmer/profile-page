import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_BACKGROUND, DEFAULT_THEME } from './defaults.ts';
import { createLink, deleteLink, listLinks, saveProfile, saveTheme } from './db.ts';
import type { BackgroundSettings, NewLink, Profile, SeedFile, ThemeSettings } from './types.ts';
import {
  isBackgroundAttachment,
  isBackgroundPosition,
  isBackgroundRepeat,
  isBackgroundSize,
  isHexColor,
  isHttpUrl,
  isOpacity,
  isSafeAssetRef,
  isThemeMode,
} from './validate.ts';

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Fill in defaults for fields missing from older backups. */
function normalizeBackground(raw: unknown): BackgroundSettings {
  const obj = asObject(raw);
  const imagePath = obj['imagePath'];
  const opacity =
    typeof obj['opacity'] === 'number'
      ? obj['opacity']
      : Number.parseInt(String(obj['opacity'] ?? ''), 10);
  return {
    imagePath: typeof imagePath === 'string' && imagePath.length > 0 ? imagePath : null,
    size: isBackgroundSize(obj['size']) ? obj['size'] : DEFAULT_BACKGROUND.size,
    position: isBackgroundPosition(obj['position']) ? obj['position'] : DEFAULT_BACKGROUND.position,
    repeat: isBackgroundRepeat(obj['repeat']) ? obj['repeat'] : DEFAULT_BACKGROUND.repeat,
    attachment: isBackgroundAttachment(obj['attachment'])
      ? obj['attachment']
      : DEFAULT_BACKGROUND.attachment,
    color: isHexColor(obj['color']) ? obj['color'] : null,
    opacity: isOpacity(opacity) ? opacity : DEFAULT_BACKGROUND.opacity,
  };
}

function normalizeTheme(raw: unknown): ThemeSettings {
  const obj = asObject(raw);
  return {
    backgroundDark: asString(obj['backgroundDark'], DEFAULT_THEME.backgroundDark),
    backgroundLight: asString(obj['backgroundLight'], DEFAULT_THEME.backgroundLight),
    textDark: asString(obj['textDark'], DEFAULT_THEME.textDark),
    textLight: asString(obj['textLight'], DEFAULT_THEME.textLight),
    accentColor: asString(obj['accentColor'], DEFAULT_THEME.accentColor),
    faviconPath: asString(obj['faviconPath'], DEFAULT_THEME.faviconPath),
    backgroundImageDark: normalizeBackground(obj['backgroundImageDark']),
    backgroundImageLight: normalizeBackground(obj['backgroundImageLight']),
    defaultMode: isThemeMode(obj['defaultMode']) ? obj['defaultMode'] : DEFAULT_THEME.defaultMode,
    visitorToggle: obj['visitorToggle'] === true,
  };
}

export function parseSeed(raw: unknown): SeedFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Seed must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const profile = obj['profile'];
  const theme = obj['theme'];
  const links = obj['links'];
  if (typeof profile !== 'object' || profile === null) {
    throw new Error('Seed is missing a "profile" object');
  }
  if (typeof theme !== 'object' || theme === null) {
    throw new Error('Seed is missing a "theme" object');
  }
  if (!Array.isArray(links)) {
    throw new Error('Seed is missing a "links" array');
  }
  return {
    profile: profile as Profile,
    theme: normalizeTheme(theme),
    links: links as NewLink[],
  };
}

/** Apply the same input rules as the admin routes before writing anything. */
export function validateSeed(seed: SeedFile): void {
  if (seed.profile.avatarPath !== null && !isSafeAssetRef(seed.profile.avatarPath)) {
    throw new Error(`Invalid avatarPath: ${seed.profile.avatarPath}`);
  }
  if (!isSafeAssetRef(seed.theme.faviconPath)) {
    throw new Error(`Invalid faviconPath: ${seed.theme.faviconPath}`);
  }
  for (const bg of [seed.theme.backgroundImageDark, seed.theme.backgroundImageLight]) {
    if (bg.imagePath !== null && !isSafeAssetRef(bg.imagePath)) {
      throw new Error(`Invalid background image path: ${bg.imagePath}`);
    }
  }
  for (const link of seed.links) {
    if (!isHttpUrl(link.url)) {
      throw new Error(`Invalid link URL (must be http/https): ${link.url}`);
    }
    if (link.iconType === 'image' && !isSafeAssetRef(link.iconValue)) {
      throw new Error(`Invalid icon image path: ${link.iconValue}`);
    }
  }
}

/** Replace the profile, theme, and all links with the seed's contents. */
export function applySeed(database: DatabaseSync, seed: SeedFile): void {
  validateSeed(seed);
  saveProfile(database, seed.profile);
  saveTheme(database, seed.theme);
  for (const link of listLinks(database)) deleteLink(database, link.id);
  for (const link of seed.links) createLink(database, link);
}
