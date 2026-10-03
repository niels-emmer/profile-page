/** Shared input validation used by both the HTTP routes and the seed loader. */

import type {
  BackgroundAttachment,
  BackgroundPosition,
  BackgroundRepeat,
  BackgroundSize,
  ThemeMode,
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
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

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

export function isThemeMode(value: unknown): value is ThemeMode {
  return oneOf(THEME_MODES, value);
}

/** A 3- or 6-digit hex colour, as produced by `<input type="color">`. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/** An integer percentage in the range 0-100. */
export function isOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** Control characters (incl. CR/LF) are never valid in a URL or asset path. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function isHttpUrl(value: string): boolean {
  // `new URL()` strips CR/LF during parsing, so reject them on the raw value.
  if (CONTROL_CHARS.test(value)) return false;
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
  return (
    value.startsWith('/assets/') &&
    !value.includes('..') &&
    !value.includes('\\') &&
    !CONTROL_CHARS.test(value)
  );
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

/* ------------------------- identity / entity text ----------------------- */

/** Collapse whitespace/control characters and cap a single-line text value. */
export function cleanText(value: string, maxLength = 200): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Parse a textarea into a list of non-empty, cleaned lines. */
export function parseLines(value: string, maxItems = 25, maxLength = 120): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => cleanText(line, maxLength))
    .filter((line) => line.length > 0)
    .slice(0, maxItems);
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** A pragmatic email check; the value is published, so keep it simple. */
export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

/** A pragmatic telephone check: an optional +, then digits and separators. */
const TELEPHONE = /^\+?[0-9 ().-]{3,25}$/;

export function isTelephone(value: string): boolean {
  return TELEPHONE.test(value);
}
