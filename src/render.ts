import { COLOR_SCHEMES, readableTextColor } from './colors.ts';
import type {
  BackgroundPosition,
  BackgroundSettings,
  BackgroundSize,
  Link,
  Profile,
  ThemeMode,
  ThemeSettings,
} from './types.ts';

const BADGE_SVG =
  '<svg class="badge" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true">' +
  '<path fill="#179cf0" d="M126.22,193.94c-4-1.79-8.38-3.03-11.92-5.47-10.35-7.13-19.99-5.75-29.73,1.07-2.11,1.48-4.74,2.34-7.24,3.12-5.46,1.72-9.86,.27-13.07-4.52-2.28-3.41-4.61-6.93-6.08-10.72-3.42-8.79-9.82-12.76-18.93-13.5-3.91-.32-7.85-1.16-11.62-2.3-7.51-2.28-10.2-8.34-8.26-17.2,1.02-4.65,2.52-9.43,2.24-14.06-.22-3.66-2.26-7.61-4.53-10.64-2.96-3.96-7.03-7.07-10.48-10.68-4.81-5.04-5.3-11.17-1.01-16.59,2.77-3.51,5.84-6.92,9.3-9.72,6.71-5.41,6.94-12.32,5.74-19.86-.65-4.06-1.42-8.15-1.56-12.25-.24-6.79,1.88-9.72,8.46-11.56,4.9-1.37,9.97-2.18,14.99-3.05,5.99-1.04,11.01-3.25,13.65-9.3,1.59-3.64,3.62-7.08,5.45-10.62,4.81-9.35,11.51-11.61,20.84-6.89,3.53,1.79,6.89,3.93,10.41,5.75,4.82,2.49,9.59,2.76,14.71,.28,5.91-2.85,11.98-5.57,18.27-7.29,2.56-.7,7.04,.44,8.63,2.39,4.05,4.94,7.41,10.59,10.21,16.36,2.91,5.99,7.75,8.18,13.68,9.29,4.84,.9,9.76,1.59,14.46,2.99,7.24,2.15,10.27,7.18,9.11,14.36-.76,4.7-1.96,9.34-2.63,14.06-1.12,7.84,3.09,13.13,8.76,17.76,4.88,3.98,9.51,7.76,9.22,15.42-.23,6.11-3.23,9.86-7.22,13.3-4.97,4.28-10.18,8.58-10.58,15.5-.29,5,.82,10.14,1.79,15.13,2.15,11.16-.16,15.08-11.25,17.83-3.83,.95-7.71,1.97-11.62,2.3-8.28,.7-12.44,5.92-15.51,12.81-1.47,3.32-3.18,6.57-5.13,9.63-2.53,3.98-5.82,6.95-11.53,6.86Zm22.23-125.22c-5.54-4.05-10.68-7.8-15.85-11.58-14.9,19.6-29.46,38.75-44.21,58.15-8.33-6.32-16.31-12.38-24.43-18.53-4.06,5.61-7.7,10.65-11.46,15.83,13.75,10.3,27.02,20.23,40.59,30.38,18.48-24.79,36.8-49.36,55.35-74.26Z"/>' +
  '<path fill="#fcfcfc" d="M148.45,68.73c-18.55,24.89-36.88,49.47-55.35,74.26-13.57-10.16-26.84-20.09-40.59-30.38,3.75-5.18,7.4-10.22,11.46-15.83,8.11,6.16,16.1,12.21,24.43,18.53,14.75-19.4,29.3-38.55,44.21-58.15,5.17,3.78,10.31,7.53,15.85,11.58Z"/>' +
  '</svg>';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Allow only characters that can appear in a CSS colour or gradient value.
 * Blocks `</style>` injection and `url(...)` payloads from admin-supplied data.
 */
export function sanitizeCss(value: string): string {
  return value.replace(/[^a-zA-Z0-9#(),.%\s/-]/g, '');
}

/** MIME type for an image path, derived from the (validated) file extension. */
export function imageMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/png';
}

/** `#rgb` / `#rrggbb` to an `r, g, b` triple, or null if it is not a hex colour. */
function hexToRgb(hex: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  let value = match[1] ?? '';
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/**
 * Compose a CSS `background` value: the uploaded image (if any) layered over
 * the solid colour (or the theme base). When the image is less than fully
 * opaque, a translucent veil of the colour is drawn over it, which is how CSS
 * fakes a semi-transparent background image. Every option is an enum or a
 * validated hex colour, so nothing user-supplied reaches the stylesheet except
 * the validated asset path.
 */
export function backgroundValue(base: string, bg: BackgroundSettings): string {
  const behind = bg.color ?? base;
  if (bg.imagePath === null) return sanitizeCss(behind);
  const size = bg.size === 'stretch' ? '100% 100%' : bg.size;
  const image = `url(${bg.imagePath}) ${bg.position}/${size} ${bg.repeat} ${bg.attachment}`;
  const rgb = bg.color !== null ? hexToRgb(bg.color) : null;
  if (rgb === null || bg.opacity >= 100) return sanitizeCss(`${image}, ${behind}`);
  const alpha = (100 - bg.opacity) / 100;
  const veil = `linear-gradient(rgba(${rgb}, ${alpha}), rgba(${rgb}, ${alpha}))`;
  return sanitizeCss(`${veil}, ${image}, ${behind}`);
}

/** Absolute URL of the avatar (uploaded image or bundled default). */
export function avatarUrlFor(profile: Profile, baseUrl: string): string {
  return profile.avatarPath !== null
    ? `${baseUrl}${profile.avatarPath}`
    : `${baseUrl}/assets/default-avatar.svg`;
}

export interface PageContext {
  profile: Profile;
  links: Link[];
  theme: ThemeSettings;
  baseUrl: string;
}

function renderLink(link: Link, index: number): string {
  const from = sanitizeCss(link.colorFrom);
  const to = link.colorMode === 'gradient' ? sanitizeCss(link.colorTo) : from;
  const background = `linear-gradient(45deg, ${from} 0%, ${to} 100%)`;
  const border = link.borderColor !== null ? ` border: 1px solid ${sanitizeCss(link.borderColor)};` : '';
  const icon =
    link.iconType === 'image'
      ? `<img alt="" class="icon hvr-icon" src="${escapeHtml(link.iconValue)}">`
      : `<i class="icon hvr-icon ${escapeHtml(link.iconValue)}"${
          link.iconColor !== null ? ` style="color: ${sanitizeCss(link.iconColor)}"` : ''
        }></i>`;
  const target = link.newWindow ? ' target="_blank"' : '';
  return (
    `<div style="--delay: ${index + 1}s" class="button-entrance">` +
    `<a class="button button-hover icon-hover" style="color: ${sanitizeCss(link.textColor)}; background-image: ${background};${border}" ` +
    `rel="noopener noreferrer nofollow noindex" href="${escapeHtml(link.url)}"${target}>${icon}${escapeHtml(link.text)}</a>` +
    `</div>`
  );
}

/**
 * The visitor-facing theme switcher: a single icon in the bottom-right corner
 * that expands on hover/focus (or tap) to offer light, dark, and system.
 * Rendered only when the owner has enabled visitor selection.
 */
function renderThemeSwitcher(): string {
  const option = (value: string, label: string, icon: string): string =>
    `<button type="button" role="menuitemradio" aria-checked="false" data-theme-value="${value}" aria-label="${label}"><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
  return `<div class="theme-switcher" data-theme-switcher>
  <button type="button" class="theme-switcher-toggle" aria-label="Change theme" aria-haspopup="true" aria-expanded="false">
    <i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
  </button>
  <div class="theme-switcher-menu" role="menu" aria-label="Theme">
    ${option('light', 'Light theme', 'fa-sun')}
    ${option('dark', 'Dark theme', 'fa-moon')}
    ${option('system', 'System theme', 'fa-desktop')}
  </div>
</div>`;
}

export function renderProfilePage(ctx: PageContext): string {
  const { profile, links, theme, baseUrl } = ctx;
  const avatar = profile.avatarPath ?? '/assets/default-avatar.svg';
  const avatarUrl = avatarUrlFor(profile, baseUrl);
  // The social preview card when one has been generated; otherwise the avatar.
  const ogImageUrl = theme.ogImagePath !== null ? `${baseUrl}${theme.ogImagePath}` : avatarUrl;
  const description = `${profile.tagline} ${profile.description}`.trim();

  // schema.org Person, for rich results and AI answer engines. `<` is escaped
  // so a value can never break out of the script element.
  const sameAs = links.map((link) => link.url);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    description,
    url: `${baseUrl}/`,
    image: avatarUrl,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }).replaceAll('<', '\\u003c');

  const darkVars = `--bg:${backgroundValue(theme.backgroundDark, theme.backgroundImageDark)};--fg:${sanitizeCss(theme.textDark)};`;
  const lightVars = `--bg:${backgroundValue(theme.backgroundLight, theme.backgroundImageLight)};--fg:${sanitizeCss(theme.textLight)};`;
  const themeStyle =
    `<style>` +
    `:root{--accent:${sanitizeCss(theme.accentColor)};}` +
    `:root[data-theme='dark']{${darkVars}}` +
    `:root[data-theme='light']{${lightVars}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme]){${darkVars}}}` +
    `@media (prefers-color-scheme: light){:root:not([data-theme]){${lightVars}}}` +
    `</style>`;

  // A forced default is baked into the markup so it applies without JS; the
  // visitor's own choice (when enabled) is layered on by theme.js before paint.
  const htmlAttrs =
    (theme.defaultMode === 'system' ? '' : ` data-theme="${theme.defaultMode}"`) +
    (theme.visitorToggle ? ' data-theme-toggle="on"' : '');

  const buttons = links.map((link, index) => renderLink(link, index)).join('\n');

  return `<!DOCTYPE html>
<html lang="en"${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${sanitizeCss(theme.accentColor)}">
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${escapeHtml(profile.name)}">
<meta name="robots" content="index,follow">
<meta property="og:url" content="${escapeHtml(baseUrl)}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(profile.name)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(profile.name)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
<title>${escapeHtml(profile.name)}</title>
<link rel="canonical" href="${escapeHtml(baseUrl)}/">
<link rel="alternate" type="text/vcard" href="/contact.vcf">
<link rel="alternate" type="application/json" href="/contact.json">
${links.map((link) => `<link rel="me" href="${escapeHtml(link.url)}">`).join('\n')}
<link rel="icon" type="${imageMime(theme.faviconPath)}" href="${escapeHtml(theme.faviconPath)}">
<link rel="apple-touch-icon" href="${escapeHtml(theme.faviconPath)}">
<link rel="stylesheet" href="/assets/css/fontawesome.css">
<link rel="stylesheet" href="/assets/css/style.css">
${themeStyle}
${theme.visitorToggle ? '<script src="/assets/js/theme.js"></script>' : ''}
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<div class="container">
  <div class="row">
    <div class="column" style="margin-top: 5%">
      <img alt="avatar" id="avatar" class="rounded-avatar fadein" src="${escapeHtml(avatar)}" height="128px" width="128px" style="object-fit: cover;">
      <h1 class="fadein">${escapeHtml(profile.name)}<span title="Verified user">${BADGE_SVG}</span></h1>
      <center><div class="fadein description-parent"><h3>${escapeHtml(profile.tagline)}</h3><p>${escapeHtml(profile.description)}</p></div></center>
${buttons}
      <p class="contact-link"><a href="/contact.vcf">Add to contacts</a></p>
    </div>
  </div>
</div>
${theme.visitorToggle ? renderThemeSwitcher() : ''}
</body>
</html>
`;
}

/* --------------------------- crawler / agent files --------------------- */

export function renderRobotsTxt(baseUrl: string): string {
  return (
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /admin\n' +
    'Disallow: /login\n' +
    '\n' +
    `Sitemap: ${baseUrl}/sitemap.xml\n`
  );
}

export function renderSitemap(baseUrl: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    `    <loc>${escapeHtml(baseUrl)}/</loc>\n` +
    '  </url>\n' +
    '</urlset>\n'
  );
}

/** Collapse newlines and strip markdown link syntax from an inline value. */
function markdownInline(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[[\]()]/g, '').trim();
}

/** A short plain-text summary following the llms.txt convention. */
export function renderLlmsTxt(profile: Profile, links: Link[], baseUrl: string): string {
  const summary = markdownInline(`${profile.tagline} ${profile.description}`);
  const description = profile.description.replace(/\r\n?/g, '\n').trim();
  const linkLines = links
    .map((link) => `- [${markdownInline(link.text)}](${link.url})`)
    .join('\n');
  return (
    `# ${markdownInline(profile.name)}\n\n` +
    `> ${summary}\n\n` +
    `${description}\n\n` +
    `Canonical page: ${baseUrl}/\n\n` +
    '## Links\n\n' +
    `${linkLines}\n`
  );
}

/* ------------------------------- login page ---------------------------- */

export function renderLoginPage(csrfToken: string, error?: string): string {
  const banner = error !== undefined ? `<p class="admin-error">${escapeHtml(error)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign in</title>
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/admin.css">
</head>
<body class="admin-body">
<main class="admin-card admin-card--narrow">
  <div class="admin-card-header">
    <h1 class="admin-title">Sign in</h1>
    <p class="admin-card-description">Enter your admin password to continue.</p>
  </div>
  ${banner}
  <form method="post" action="/login" class="admin-form">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <label class="admin-field">Password
      <input type="password" name="password" autocomplete="current-password" required autofocus>
    </label>
    <button type="submit" class="admin-button">Sign in</button>
  </form>
</main>
</body>
</html>
`;
}

/* ------------------------------- admin page ---------------------------- */

export interface AdminContext {
  profile: Profile;
  links: Link[];
  theme: ThemeSettings;
  csrfToken: string;
  saved: boolean;
  error?: string;
  /** True when ADMIN_PASSWORD is set, so a UI password change is temporary. */
  passwordManagedByEnv: boolean;
}

function field(label: string, name: string, value: string, type = 'text'): string {
  return `<label class="admin-field">${escapeHtml(label)}
      <input type="${type}" name="${name}" value="${escapeHtml(value)}">
    </label>`;
}

function colorField(label: string, name: string, value: string): string {
  return `<label class="admin-field admin-field--color">${escapeHtml(label)}
      <input type="color" name="${name}" value="${escapeHtml(value)}">
    </label>`;
}

function cardHeader(title: string, description?: string): string {
  const hint =
    description !== undefined
      ? `<p class="admin-card-description">${escapeHtml(description)}</p>`
      : '';
  return `<div class="admin-card-header"><h2>${escapeHtml(title)}</h2>${hint}</div>`;
}

function presetButtons(): string {
  return COLOR_SCHEMES.map(
    (scheme) =>
      `<button type="button" class="preset" data-from="${escapeHtml(scheme.from)}" data-to="${escapeHtml(scheme.to)}" title="${escapeHtml(scheme.name)}" style="background-image: linear-gradient(45deg, ${escapeHtml(scheme.from)} 0%, ${escapeHtml(scheme.to)} 100%)">${escapeHtml(scheme.name)}</button>`,
  ).join('\n');
}

const BACKGROUND_SIZE_OPTIONS: Array<{ value: BackgroundSize; label: string }> = [
  { value: 'cover', label: 'Fill (cover)' },
  { value: 'contain', label: 'Fit (contain)' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'auto', label: 'Original size' },
];

const BACKGROUND_POSITION_OPTIONS: Array<{ value: BackgroundPosition; label: string }> = [
  { value: 'top left', label: 'Top left' },
  { value: 'top', label: 'Top' },
  { value: 'top right', label: 'Top right' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'bottom left', label: 'Bottom left' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'bottom right', label: 'Bottom right' },
];

const BACKGROUND_ATTACHMENT_OPTIONS = [
  { value: 'scroll', label: 'Scrolls with the page' },
  { value: 'fixed', label: 'Fixed (stays put)' },
];

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System (follow the visitor)' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function selectField(
  label: string,
  name: string,
  options: Array<{ value: string; label: string }>,
  selected: string,
): string {
  const opts = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
    )
    .join('');
  return `<label class="admin-field">${escapeHtml(label)}<select name="${name}">${opts}</select></label>`;
}

function faviconSection(theme: ThemeSettings, csrfToken: string): string {
  const custom = theme.faviconPath.startsWith('/assets/uploads/');
  // The remove button lives in the upload row but submits its own form, so the
  // two actions sit side by side without nesting forms.
  const removeButton = custom
    ? '<button type="submit" form="favicon-remove" class="admin-button admin-button--danger">Remove</button>'
    : '';
  const removeForm = custom
    ? `<form id="favicon-remove" method="post" action="/admin/favicon/remove" data-confirm="Remove the custom favicon?">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    </form>`
    : '';
  return `<section id="favicon" class="admin-card">
    ${cardHeader('Favicon', 'Shown in the browser tab and on mobile home screens. Uploads are centre-cropped to a 512×512 PNG in your browser.')}
    <img class="admin-favicon" src="${escapeHtml(theme.faviconPath)}" alt="Current favicon">
    <form method="post" action="/admin/favicon" enctype="multipart/form-data" class="admin-form" data-image-process="favicon">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <div class="admin-field">
        <span>Favicon image (JPEG, PNG, WebP; max 5 MB)</span>
        <div class="admin-file-row">
          <input type="file" name="favicon" accept="image/jpeg,image/png,image/webp" required>
          <button type="submit" class="admin-button">Upload</button>
          ${removeButton}
        </div>
      </div>
    </form>
    ${removeForm}
  </section>`;
}

function previewSection(theme: ThemeSettings, profile: Profile, csrfToken: string): string {
  const ogPath = theme.ogImagePath;
  const preview = ogPath !== null
    ? `<img class="admin-og-preview" src="${escapeHtml(ogPath)}" alt="Current preview image">`
    : '<div class="admin-og-preview admin-og-preview--empty">No preview image yet</div>';
  const removeButton = ogPath !== null
    ? '<button type="submit" form="ogimage-remove" class="admin-button admin-button--danger">Remove</button>'
    : '';
  const removeForm = ogPath !== null
    ? `<form id="ogimage-remove" method="post" action="/admin/ogimage/remove" data-confirm="Remove the preview image?">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    </form>`
    : '';
  return `<section id="preview" class="admin-card">
    ${cardHeader('Preview image', 'The card shown when your page is shared on Discord, Slack, or Twitter. 1200×630.')}
    ${preview}
    <div class="admin-actions">
      <button type="button" class="admin-button" data-generate-og
        data-csrf="${escapeHtml(csrfToken)}"
        data-accent="${escapeHtml(theme.accentColor)}"
        data-text-color="${escapeHtml(readableTextColor(theme.accentColor))}"
        data-name="${escapeHtml(profile.name)}"
        data-tagline="${escapeHtml(profile.tagline)}"
        data-avatar="${escapeHtml(profile.avatarPath ?? '/assets/default-avatar.svg')}">Generate</button>
    </div>
    <form method="post" action="/admin/ogimage" enctype="multipart/form-data" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <div class="admin-field">
        <span>Or upload your own image (JPEG, PNG, WebP; max 5 MB)</span>
        <div class="admin-file-row">
          <input type="file" name="ogimage" accept="image/jpeg,image/png,image/webp" required>
          <button type="submit" class="admin-button">Upload</button>
          ${removeButton}
        </div>
      </div>
    </form>
    ${removeForm}
  </section>`;
}

function themeSection(theme: ThemeSettings, csrfToken: string): string {
  return `<section id="theme" class="admin-card">
    ${cardHeader('Theme', 'Set the default appearance and whether visitors can change it.')}
    <form method="post" action="/admin/theme" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      ${selectField('Default theme', 'defaultMode', THEME_MODE_OPTIONS, theme.defaultMode)}
      <label class="admin-check"><input type="checkbox" name="visitorToggle"${theme.visitorToggle ? ' checked' : ''}> Let visitors switch the theme</label>
      <h3>Colours</h3>
      ${colorField('Text (dark)', 'textDark', theme.textDark)}
      ${colorField('Text (light)', 'textLight', theme.textLight)}
      ${colorField('Accent', 'accentColor', theme.accentColor)}
      <div class="admin-actions"><button type="submit" class="admin-button">Save theme</button></div>
    </form>
  </section>`;
}

function backgroundSection(
  slot: 'dark' | 'light',
  title: string,
  bg: BackgroundSettings,
  csrfToken: string,
): string {
  const label = escapeHtml(title.toLowerCase());
  const preview =
    bg.imagePath !== null
      ? `<img class="admin-background-preview" src="${escapeHtml(bg.imagePath)}" alt="Current ${label} background">`
      : '<div class="admin-background-preview admin-background-preview--empty">No background image</div>';
  // The remove button lives in the upload row but submits its own form, so the
  // two actions sit side by side without nesting forms.
  const removeFormId = `bg-remove-${slot}`;
  const removeButton =
    bg.imagePath !== null
      ? `<button type="submit" form="${removeFormId}" class="admin-button admin-button--danger">Remove</button>`
      : '';
  const removeForm =
    bg.imagePath !== null
      ? `<form id="${removeFormId}" method="post" action="/admin/background/remove" data-confirm="Remove the ${label} background image?">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <input type="hidden" name="theme" value="${slot}">
    </form>`
      : '';
  const defaultColor = slot === 'dark' ? '#0d0f18' : '#ffffff';
  return `<details class="bg-section">
  <summary>${escapeHtml(title)}</summary>
  ${preview}
  <form method="post" action="/admin/background" enctype="multipart/form-data" class="admin-form" data-image-process="background">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <input type="hidden" name="theme" value="${slot}">
    <div class="admin-field">
      <span>Background image (JPEG, PNG, WebP; max 8 MB)</span>
      <div class="admin-file-row">
        <input type="file" name="background" accept="image/jpeg,image/png,image/webp" required>
        <button type="submit" class="admin-button">Upload</button>
        ${removeButton}
      </div>
    </div>
  </form>
  ${removeForm}
  <form method="post" action="/admin/background/options" class="admin-form">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <input type="hidden" name="theme" value="${slot}">
    <div class="admin-field admin-field--range">
      <div class="admin-range-head"><span>Image opacity</span><output class="admin-range-value">${bg.opacity}%</output></div>
      <input type="range" name="backgroundOpacity" min="0" max="100" step="1" value="${bg.opacity}">
    </div>
    <div class="admin-color-toggle">
      <label class="admin-check"><input type="checkbox" name="backgroundColorEnabled"${bg.color !== null ? ' checked' : ''}> Solid background colour</label>
      <input type="color" name="backgroundColor" value="${escapeHtml(bg.color ?? defaultColor)}">
    </div>
    <div class="admin-grid">
      ${selectField('Size', 'backgroundSize', BACKGROUND_SIZE_OPTIONS, bg.size)}
      ${selectField('Position', 'backgroundPosition', BACKGROUND_POSITION_OPTIONS, bg.position)}
      ${selectField('Scroll', 'backgroundAttachment', BACKGROUND_ATTACHMENT_OPTIONS, bg.attachment)}
    </div>
    <label class="admin-check"><input type="checkbox" name="backgroundRepeat"${bg.repeat === 'repeat' ? ' checked' : ''}> Tile (repeat)</label>
    <div class="admin-actions"><button type="submit" class="admin-button">Save background</button></div>
  </form>
</details>`;
}

function moveOrder(links: Link[], index: number, delta: number): string {
  const ids = links.map((link) => link.id);
  const target = index + delta;
  const a = ids[index];
  const b = ids[target];
  if (a === undefined || b === undefined) return ids.join(',');
  ids[index] = b;
  ids[target] = a;
  return ids.join(',');
}

function reorderForm(order: string, csrfToken: string, label: string, disabled: boolean): string {
  return `<form method="post" action="/admin/links/reorder" class="inline-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <input type="hidden" name="order" value="${escapeHtml(order)}">
      <button type="submit" class="admin-button admin-button--ghost"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>
    </form>`;
}

function renderLinkEditor(link: Link, index: number, links: Link[], csrfToken: string): string {
  const upOrder = moveOrder(links, index, -1);
  const downOrder = moveOrder(links, index, 1);
  return `<details class="link-card" data-id="${link.id}">
  <summary><span class="link-title">${escapeHtml(link.text.length > 0 ? link.text : '(untitled)')}</span><button type="button" class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">⠿</button></summary>
  <form method="post" action="/admin/links" class="admin-form">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <input type="hidden" name="id" value="${link.id}">
    ${field('Text', 'text', link.text)}
    ${field('URL', 'url', link.url, 'url')}
    <label class="admin-check"><input type="checkbox" name="newWindow"${link.newWindow ? ' checked' : ''}> Open in new window</label>
    <label class="admin-field">Icon type
      <select name="iconType">
        <option value="fa"${link.iconType === 'fa' ? ' selected' : ''}>Font Awesome</option>
        <option value="image"${link.iconType === 'image' ? ' selected' : ''}>Image path</option>
      </select>
    </label>
    ${field('Icon value (class or path)', 'iconValue', link.iconValue)}
    ${field('Icon colour (blank = inherit)', 'iconColor', link.iconColor ?? '')}
    ${colorField('Text colour', 'textColor', link.textColor)}
    <label class="admin-field">Colour mode
      <select name="colorMode">
        <option value="solid"${link.colorMode === 'solid' ? ' selected' : ''}>Solid</option>
        <option value="gradient"${link.colorMode === 'gradient' ? ' selected' : ''}>Gradient</option>
      </select>
    </label>
    ${colorField('Colour from', 'colorFrom', link.colorFrom)}
    ${colorField('Colour to', 'colorTo', link.colorTo)}
    ${field('Border colour (blank = none)', 'borderColor', link.borderColor ?? '')}
    <div class="preset-row">${presetButtons()}</div>
    <div class="admin-actions">
      <button type="submit" class="admin-button">Save link</button>
    </div>
  </form>
  <div class="admin-actions">
    ${reorderForm(upOrder, csrfToken, 'Move up', index === 0)}
    ${reorderForm(downOrder, csrfToken, 'Move down', index === links.length - 1)}
    <form method="post" action="/admin/links/${link.id}/delete" class="inline-form" data-confirm="Delete this link?">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <button type="submit" class="admin-button admin-button--danger">Delete</button>
    </form>
  </div>
</details>`;
}

function securitySection(csrfToken: string, passwordManagedByEnv: boolean): string {
  const note = passwordManagedByEnv
    ? '<p class="admin-muted">The password is managed by the ADMIN_PASSWORD environment variable and will be restored on restart, which also signs out all sessions.</p>'
    : '';
  return `<section id="security" class="admin-card">
    ${cardHeader('Security', 'Change your admin password. All other sessions are signed out.')}
    ${note}
    <form method="post" action="/admin/password" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      ${field('Current password', 'currentPassword', '', 'password')}
      ${field('New password (min 8 characters)', 'newPassword', '', 'password')}
      ${field('Confirm new password', 'confirmPassword', '', 'password')}
      <div class="admin-actions"><button type="submit" class="admin-button">Change password</button></div>
    </form>
  </section>`;
}

export function renderAdminPage(ctx: AdminContext): string {
  const { profile, links, theme, csrfToken, saved, error, passwordManagedByEnv } = ctx;
  const avatar = profile.avatarPath ?? '/assets/default-avatar.svg';
  const banner = saved ? '<p class="admin-ok">Saved.</p>' : '';
  const errorBanner = error !== undefined ? `<p class="admin-error">${escapeHtml(error)}</p>` : '';

  const linkEditors = links
    .map((link, index) => renderLinkEditor(link, index, links, csrfToken))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin</title>
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/admin.css">
</head>
<body class="admin-body">
<header class="admin-header">
  <div class="admin-header-inner">
    <div class="admin-brand">
      <span class="admin-brand-mark" aria-hidden="true">◆</span>
      <h1 class="admin-title">Admin</h1>
    </div>
    <div class="admin-header-actions">
      <a class="admin-link" href="/" target="_blank" rel="noopener">View page</a>
      <form method="post" action="/logout" class="inline-form">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <button type="submit" class="admin-button admin-button--outline admin-button--sm">Sign out</button>
      </form>
    </div>
  </div>
</header>
<main class="admin-main">
  ${banner}${errorBanner}
  <div class="admin-shell">
    <aside class="admin-nav">
      <nav class="admin-nav-list">
        <a class="admin-nav-link" href="#profile">Profile</a>
        <a class="admin-nav-link" href="#theme">Theme</a>
        <a class="admin-nav-link" href="#avatar">Avatar</a>
        <a class="admin-nav-link" href="#preview">Preview</a>
        <a class="admin-nav-link" href="#favicon">Favicon</a>
        <a class="admin-nav-link" href="#background">Background</a>
        <a class="admin-nav-link" href="#links">Links</a>
        <a class="admin-nav-link" href="#backup">Backup</a>
        <a class="admin-nav-link" href="#security">Security</a>
      </nav>
    </aside>
    <div class="admin-content">

  <section id="profile" class="admin-card">
    ${cardHeader('Profile', 'Your name, tagline, and description.')}
    <form method="post" action="/admin/profile" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      ${field('Name', 'name', profile.name)}
      ${field('Tagline', 'tagline', profile.tagline)}
      <label class="admin-field">Description
        <textarea name="description" rows="3">${escapeHtml(profile.description)}</textarea>
      </label>
      <div class="admin-actions"><button type="submit" class="admin-button">Save profile</button></div>
    </form>
  </section>

  ${themeSection(theme, csrfToken)}

  <section id="avatar" class="admin-card">
    ${cardHeader('Avatar', 'A square image works best; it is shown as a circle.')}
    <img class="admin-avatar" src="${escapeHtml(avatar)}" alt="Current avatar">
    <form method="post" action="/admin/avatar" enctype="multipart/form-data" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <div class="admin-field">
        <span>Avatar image (JPEG, PNG, WebP; max 5 MB)</span>
        <div class="admin-file-row">
          <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required>
          <button type="submit" class="admin-button">Upload</button>
        </div>
      </div>
    </form>
  </section>

  ${previewSection(theme, profile, csrfToken)}

  ${faviconSection(theme, csrfToken)}

  <section id="background" class="admin-card">
    ${cardHeader('Background', 'Each colour scheme can have its own background image. Uploads are resized and converted in your browser for fast loading.')}
    ${backgroundSection('dark', 'Dark theme', theme.backgroundImageDark, csrfToken)}
    ${backgroundSection('light', 'Light theme', theme.backgroundImageLight, csrfToken)}
  </section>

  <section id="links" class="admin-card">
    ${cardHeader('Links', 'Drag the handle to reorder, or use the Move up/down buttons.')}
    ${linkEditors.length > 0 ? `<div class="link-list" data-reorder-url="/admin/links/reorder" data-csrf="${escapeHtml(csrfToken)}">${linkEditors}</div>` : '<p class="admin-muted">No links yet.</p>'}
  </section>

  <section id="add-link" class="admin-card">
    ${cardHeader('Add link', 'Create a new button on your page.')}
    <form method="post" action="/admin/links" class="admin-form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      ${field('Text', 'text', '')}
      ${field('URL', 'url', '', 'url')}
      <label class="admin-check"><input type="checkbox" name="newWindow" checked> Open in new window</label>
      <label class="admin-field">Icon type
        <select name="iconType">
          <option value="fa">Font Awesome</option>
          <option value="image">Image path</option>
        </select>
      </label>
      ${field('Icon value (class or path)', 'iconValue', '')}
      ${field('Icon colour (blank = inherit)', 'iconColor', '')}
      ${colorField('Text colour', 'textColor', '#ffffff')}
      <label class="admin-field">Colour mode
        <select name="colorMode">
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
        </select>
      </label>
      ${colorField('Colour from', 'colorFrom', '#0085ff')}
      ${colorField('Colour to', 'colorTo', '#0085ff')}
      ${field('Border colour (blank = none)', 'borderColor', '')}
      <div class="preset-row">${presetButtons()}</div>
      <div class="admin-actions"><button type="submit" class="admin-button">Add link</button></div>
    </form>
  </section>

  <section id="backup" class="admin-card">
    ${cardHeader('Backup & restore', 'Download everything — content, theme, and images — as a single .tar.gz, or restore a previous backup.')}
    <div class="admin-subsection">
      <h3 class="admin-subsection-title">Backup</h3>
      <p class="admin-subsection-description">Download your profile, theme, links, and uploaded images as a single .tar.gz archive. Keep it somewhere safe.</p>
      <div class="admin-actions">
        <a class="admin-button admin-button--outline" href="/admin/backup">Download backup</a>
      </div>
    </div>
    <div class="admin-subsection">
      <h3 class="admin-subsection-title">Restore</h3>
      <p class="admin-subsection-description">Replace your current profile, theme, links, and images with a previous backup. This cannot be undone.</p>
      <form method="post" action="/admin/restore" enctype="multipart/form-data" class="admin-form" data-confirm="Restoring will replace your current profile, theme, links, and images. Continue?">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <label class="admin-field">Backup file (.tar.gz)
          <input type="file" name="archive" accept=".gz,.tar.gz,application/gzip" required>
        </label>
        <div class="admin-actions"><button type="submit" class="admin-button admin-button--danger">Restore backup</button></div>
      </form>
    </div>
  </section>

  ${securitySection(csrfToken, passwordManagedByEnv)}

    </div>
  </div>
</main>
<script src="/assets/js/admin.js" defer></script>
</body>
</html>
`;
}
