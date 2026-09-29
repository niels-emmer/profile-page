/** Shared input validation used by both the HTTP routes and the seed loader. */

import type {
  BackgroundAttachment,
  BackgroundPosition,
  BackgroundRepeat,
  BackgroundSize,
} from './types.ts';

const BACKGROUND_SIZES: readonly BackgroundSize[] = ['cover', 'contain', 'stretch', 'auto'];
const BACKGROUND_POSITIONS: readonly BackgroundPosition[] = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top left',
  'top right',
  'bottom left',
  'bottom right',
];
const BACKGROUND_REPEATS: readonly BackgroundRepeat[] = ['no-repeat', 'repeat'];
const BACKGROUND_ATTACHMENTS: readonly BackgroundAttachment[] = ['scroll', 'fixed'];

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function isBackgroundSize(value: unknown): value is BackgroundSize {
  return oneOf(BACKGROUND_SIZES, value);
}

export function isBackgroundPosition(value: unknown): value is BackgroundPosition {
  return oneOf(BACKGROUND_POSITIONS, value);
}

export function isBackgroundRepeat(value: unknown): value is BackgroundRepeat {
  return oneOf(BACKGROUND_REPEATS, value);
}

export function isBackgroundAttachment(value: unknown): value is BackgroundAttachment {
  return oneOf(BACKGROUND_ATTACHMENTS, value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Asset references must point at a local bundled or uploaded asset. External
 * URLs are rejected because the CSP only permits `img-src 'self'`.
 */
export function isSafeAssetRef(value: string): boolean {
  return value.startsWith('/assets/') && !value.includes('..') && !value.includes('\\');
}

/** Reject traversal attempts before they reach the static file handler. */
export function isSafeAssetPath(path: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return !decoded.includes('..') && !decoded.includes('\0') && !decoded.includes('\\');
}
