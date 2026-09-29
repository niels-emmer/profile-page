/** Shared input validation used by both the HTTP routes and the seed loader. */

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
