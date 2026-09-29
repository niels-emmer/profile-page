import type { DatabaseSync } from 'node:sqlite';
import { createLink, deleteLink, listLinks, saveProfile, saveTheme } from './db.ts';
import type { NewLink, Profile, SeedFile, ThemeSettings } from './types.ts';
import { isHttpUrl, isSafeAssetRef } from './validate.ts';

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
    theme: theme as ThemeSettings,
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
