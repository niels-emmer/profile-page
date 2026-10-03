/**
 * Machine-readable contact representations, all derived from the profile:
 * a vCard for "add to contacts", a JSON summary, and a WebFinger probe.
 * Built from the database at request time; nothing is hard-coded. The optional
 * public email/phone (owner opt-in, stored under `entity.*`) are published here.
 */

import { DEFAULT_ENTITY } from './defaults.ts';
import { avatarUrlFor, imageMime, splitPersonName } from './render.ts';
import type { EntitySettings, Link, Profile } from './types.ts';
import { isEmail, isTelephone } from './validate.ts';

/** A filesystem-safe slug for the vCard filename. */
export function vcardSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'contact';
}

/**
 * Strip control characters (including CR/LF) from a URI value. `new URL()`
 * silently removes them during validation, so the raw stored string can still
 * carry them; without this a URL could inject extra vCard properties.
 */
function sanitizeUri(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Escape a value for a vCard text property (RFC 6350 §3.4). */
function escapeVCard(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

/** Fold a vCard line at 75 octets (RFC 6350 §3.2). */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // Continuation lines carry a leading space, so they hold one octet less.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
      limit = 74;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Best-effort structured name: the last word is treated as the family name. */
function structuredName(name: string): string {
  const { givenName, familyName } = splitPersonName(name);
  return `${escapeVCard(familyName)};${escapeVCard(givenName)};;;`;
}

/** Convert SQLite's `datetime('now')` (UTC) to an ISO 8601 timestamp. */
function toIsoTimestamp(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  return `${value.replace(' ', 'T')}Z`;
}

/** A vCard 4.0 document for the profile. */
export function renderVCard(
  profile: Profile,
  links: Link[],
  baseUrl: string,
  updatedAt?: string,
  entity: EntitySettings = DEFAULT_ENTITY,
): string {
  const avatarUrl = avatarUrlFor(profile, baseUrl);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `FN:${escapeVCard(profile.name)}`,
    `N:${structuredName(profile.name)}`,
    ...(profile.tagline.length > 0 ? [`TITLE:${escapeVCard(profile.tagline)}`] : []),
    ...(entity.jobTitle.length > 0 ? [`ROLE:${escapeVCard(entity.jobTitle)}`] : []),
    ...(entity.worksFor.length > 0 ? [`ORG:${escapeVCard(entity.worksFor)}`] : []),
    ...(profile.description.length > 0 ? [`NOTE:${escapeVCard(profile.description)}`] : []),
    ...(isEmail(entity.email) ? [`EMAIL:${escapeVCard(sanitizeUri(entity.email))}`] : []),
    ...(entity.telephone.length > 0 && isTelephone(entity.telephone)
      ? [`TEL:${escapeVCard(sanitizeUri(entity.telephone))}`]
      : []),
    `PHOTO;MEDIATYPE=${imageMime(profile.avatarPath ?? 'default-avatar.svg')}:${sanitizeUri(avatarUrl)}`,
    // The profile page itself is listed first, before the profile's links.
    `URL:${sanitizeUri(`${baseUrl}/`)}`,
    ...links.map((link) => `URL:${sanitizeUri(link.url)}`),
    `UID:${baseUrl}/`,
    `REV:${toIsoTimestamp(updatedAt)}`,
    'END:VCARD',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A JSON summary of the profile for agents. */
export function renderContactJson(
  profile: Profile,
  links: Link[],
  baseUrl: string,
  entity: EntitySettings = DEFAULT_ENTITY,
): string {
  return JSON.stringify(
    {
      name: profile.name,
      tagline: profile.tagline,
      description: profile.description,
      url: `${baseUrl}/`,
      avatar: avatarUrlFor(profile, baseUrl),
      vcard: `${baseUrl}/contact.vcf`,
      ...(entity.alternateName.length > 0 ? { alternateName: entity.alternateName } : {}),
      ...(entity.jobTitle.length > 0 ? { jobTitle: entity.jobTitle } : {}),
      ...(entity.worksFor.length > 0 ? { worksFor: entity.worksFor } : {}),
      ...(entity.alumniOf.length > 0 ? { alumniOf: entity.alumniOf } : {}),
      ...(entity.knowsAbout.length > 0 ? { knowsAbout: entity.knowsAbout } : {}),
      ...(isEmail(entity.email) ? { email: entity.email } : {}),
      ...(isTelephone(entity.telephone) ? { telephone: entity.telephone } : {}),
      sameAs: links.map((link) => link.url),
      links: links.map((link) => ({ text: link.text, url: link.url })),
    },
    null,
    2,
  );
}

/**
 * A WebFinger JRD (RFC 7033) for the profile. Returns undefined when the
 * requested resource is not one this site answers for.
 */
export function renderWebFinger(
  profile: Profile,
  links: Link[],
  baseUrl: string,
  resource: string,
): string | undefined {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return undefined;
  }
  const slug = vcardSlug(profile.name);
  const accepted = new Set([`acct:me@${host}`, `acct:${slug}@${host}`, baseUrl, `${baseUrl}/`]);
  if (!accepted.has(resource)) return undefined;

  return JSON.stringify({
    // RFC 7033 §4.4: the subject should match the requested resource.
    subject: resource,
    links: [
      { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: `${baseUrl}/` },
      {
        rel: 'http://webfinger.net/rel/avatar',
        type: imageMime(profile.avatarPath ?? 'default-avatar.svg'),
        href: avatarUrlFor(profile, baseUrl),
      },
      { rel: 'alternate', type: 'text/vcard', href: `${baseUrl}/contact.vcf` },
      { rel: 'alternate', type: 'application/json', href: `${baseUrl}/contact.json` },
      ...links.map((link) => ({ rel: 'me', href: link.url })),
    ],
  });
}
