import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageType = 'jpg' | 'png' | 'webp';

export class UploadError extends Error {}

/** Identify an image from its magic bytes; never trust the client filename. */
export function detectImageType(bytes: Uint8Array): ImageType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return undefined;
}

/** True when the payload looks like an SVG document. */
export function isSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('utf8');
  return /<svg[\s>]/i.test(head);
}

/**
 * Strip active content from an SVG. SVGs are only ever rendered via `<img>`
 * (where scripts do not run) and the CSP blocks inline scripts, so this is
 * defence in depth for restored backups.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*(?:"|')?\s*javascript:[^"'>\s]*/gi, '');
}

export interface SavedImage {
  /** Public path under /assets/uploads. */
  path: string;
  filename: string;
}

/**
 * Validate and persist an uploaded image. The filename is generated, so the
 * client-supplied name can never influence the path.
 */
export function saveImage(bytes: Uint8Array, uploadsDir: string): SavedImage {
  if (bytes.length === 0) throw new UploadError('No file uploaded.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError('Image exceeds the 5 MB limit.');
  const type = detectImageType(bytes);
  if (type === undefined) {
    throw new UploadError('Unsupported image format. Use JPEG, PNG, or WebP.');
  }
  const filename = `${randomBytes(16).toString('hex')}.${type}`;
  writeFileSync(join(uploadsDir, filename), bytes);
  return { path: `/assets/uploads/${filename}`, filename };
}
