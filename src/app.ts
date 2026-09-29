import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import type { DatabaseSync } from 'node:sqlite';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  RateLimiter,
  createSessionToken,
  csrfMatches,
  generateCsrfToken,
  verifyPassword,
  verifySessionToken,
} from './auth.ts';
import { BackupError, MAX_ARCHIVE_BYTES, buildBackup, restoreBackup } from './backup.ts';
import type { Config } from './config.ts';
import { renderContactJson, renderVCard, renderWebFinger, vcardSlug } from './contact.ts';
import { DEFAULT_THEME } from './defaults.ts';
import {
  createLink,
  deleteLink,
  getProfile,
  getProfileUpdatedAt,
  getTheme,
  listLinks,
  reorderLinks,
  saveProfile,
  saveTheme,
  updateLink,
  type AuthRecord,
} from './db.ts';
import {
  renderAdminPage,
  renderLlmsTxt,
  renderLoginPage,
  renderProfilePage,
  renderRobotsTxt,
  renderSitemap,
} from './render.ts';
import type { BackgroundSettings, NewLink, ThemeSettings } from './types.ts';
import { MAX_BACKGROUND_BYTES, UploadError, deleteUpload, saveImage } from './upload.ts';
import {
  isBackgroundAttachment,
  isBackgroundPosition,
  isBackgroundSize,
  isHttpUrl,
  isSafeAssetPath,
  isSafeAssetRef,
  isThemeMode,
} from './validate.ts';

export interface AppDeps {
  config: Config;
  db: DatabaseSync;
  auth: AuthRecord;
  /** Directory served for bundled assets. Defaults to `./public`. */
  publicDir?: string;
}

// Inline styles are required: the public page emits a per-request <style> block
// and inline style attributes for link colours. Scripts are external only.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/** A plausible hostname (optionally with a port); used to vet forwarded hosts. */
const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/i;

const LOGIN_BODY_LIMIT = 16 * 1024;
const AVATAR_BODY_LIMIT = 6 * 1024 * 1024;
const IMAGE_BODY_LIMIT = 6 * 1024 * 1024;
const BACKGROUND_BODY_LIMIT = MAX_BACKGROUND_BYTES + 1024 * 1024;

export function createApp(deps: AppDeps): Hono {
  const { config, db, auth } = deps;
  const publicDir = deps.publicDir ?? './public';
  const loginLimiter = new RateLimiter(5, 15 * 60 * 1000);
  const app = new Hono();

  /* ---------------------------- security headers ------------------------- */

  app.use('*', async (c, next) => {
    c.header('Content-Security-Policy', CSP);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (config.secureCookies) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    await next();
  });

  /* -------------------------------- helpers ------------------------------ */

  function formField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    return typeof value === 'string' ? value : '';
  }

  function emptyToNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /** Which colour scheme a background request targets. */
  function themeSlot(value: string): 'dark' | 'light' | undefined {
    return value === 'dark' || value === 'light' ? value : undefined;
  }

  function withBackground(
    theme: ThemeSettings,
    slot: 'dark' | 'light',
    background: BackgroundSettings,
  ): ThemeSettings {
    return slot === 'dark'
      ? { ...theme, backgroundImageDark: background }
      : { ...theme, backgroundImageLight: background };
  }

  function clientIp(c: Context): string {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded !== undefined && forwarded.length > 0) {
      // The trusted reverse proxy appends the real client address, so the last
      // entry is the one we can trust; earlier entries are client-controlled.
      const parts = forwarded
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const last = parts[parts.length - 1];
      if (last !== undefined) return last;
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /** Absolute base URL for meta tags, honouring the proxy's forwarded headers. */
  function requestBaseUrl(c: Context): string {
    if (config.baseUrl !== undefined) return config.baseUrl.replace(/\/+$/, '');
    const url = new URL(c.req.url);
    const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
    const scheme =
      forwardedProto === 'https' || forwardedProto === 'http'
        ? forwardedProto
        : url.protocol.replace(':', '');
    // Only trust a forwarded host that looks like a hostname; anything else
    // (empty, CRLF, spaces) falls back to the request's own host. This blocks
    // host-header poisoning of the absolute URLs we emit. Set BASE_URL in
    // production to bypass forwarded headers entirely.
    const host =
      forwardedHost !== undefined && HOST_PATTERN.test(forwardedHost)
        ? forwardedHost
        : url.host;
    return `${scheme}://${host}`;
  }

  function ensureCsrf(c: Context): string {
    const existing = getCookie(c, CSRF_COOKIE);
    if (existing !== undefined && existing.length > 0) return existing;
    const token = generateCsrfToken();
    setCookie(c, CSRF_COOKIE, token, {
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      secure: config.secureCookies,
      maxAge: SESSION_TTL_SECONDS,
    });
    return token;
  }

  function csrfOk(c: Context, formToken: string): boolean {
    return csrfMatches(getCookie(c, CSRF_COOKIE), formToken);
  }

  function isAuthenticated(c: Context): boolean {
    const token = getCookie(c, SESSION_COOKIE);
    return token !== undefined && verifySessionToken(auth.sessionSecret, token);
  }

  /** Gate every /admin route before any body is read. */
  const authGuard = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    if (!isAuthenticated(c)) return c.redirect('/login');
    await next();
  };
  app.use('/admin', authGuard);
  app.use('/admin/*', authGuard);

  function parseLinkForm(body: Record<string, unknown>): NewLink {
    return {
      text: formField(body, 'text').trim(),
      url: formField(body, 'url').trim(),
      newWindow: formField(body, 'newWindow') === 'on',
      iconType: formField(body, 'iconType') === 'image' ? 'image' : 'fa',
      iconValue: formField(body, 'iconValue').trim(),
      iconColor: emptyToNull(formField(body, 'iconColor')),
      textColor: formField(body, 'textColor') || '#ffffff',
      colorMode: formField(body, 'colorMode') === 'gradient' ? 'gradient' : 'solid',
      colorFrom: formField(body, 'colorFrom') || '#0085ff',
      colorTo: formField(body, 'colorTo') || '#0085ff',
      borderColor: emptyToNull(formField(body, 'borderColor')),
    };
  }

  /* -------------------------------- public ------------------------------- */

  app.get('/health', (c) => c.text('ok'));

  app.get('/', (c) => {
    c.header(
      'Link',
      '</contact.vcf>; rel="alternate"; type="text/vcard", </contact.json>; rel="alternate"; type="application/json"',
    );
    return c.html(
      renderProfilePage({
        profile: getProfile(db),
        links: listLinks(db),
        theme: getTheme(db),
        baseUrl: requestBaseUrl(c),
      }),
    );
  });

  app.get('/robots.txt', (c) => {
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.body(renderRobotsTxt(requestBaseUrl(c)));
  });

  app.get('/sitemap.xml', (c) => {
    c.header('Content-Type', 'application/xml; charset=utf-8');
    return c.body(renderSitemap(requestBaseUrl(c)));
  });

  app.get('/llms.txt', (c) => {
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.body(renderLlmsTxt(getProfile(db), listLinks(db), requestBaseUrl(c)));
  });

  app.get('/contact.vcf', (c) => {
    const profile = getProfile(db);
    c.header('Content-Type', 'text/vcard; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${vcardSlug(profile.name)}.vcf"`);
    return c.body(renderVCard(profile, listLinks(db), requestBaseUrl(c), getProfileUpdatedAt(db)));
  });

  app.get('/contact.json', (c) => {
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Access-Control-Allow-Origin', '*');
    return c.body(renderContactJson(getProfile(db), listLinks(db), requestBaseUrl(c)));
  });

  app.get('/.well-known/webfinger', (c) => {
    const resource = c.req.query('resource');
    // RFC 7033 §4.2: a missing resource parameter is a client error.
    if (resource === undefined || resource.length === 0) {
      return c.text('Missing resource parameter', 400);
    }
    const jrd = renderWebFinger(getProfile(db), listLinks(db), requestBaseUrl(c), resource);
    if (jrd === undefined) return c.notFound();
    c.header('Content-Type', 'application/jrd+json; charset=utf-8');
    c.header('Access-Control-Allow-Origin', '*');
    return c.body(jrd);
  });

  /* --------------------------------- auth -------------------------------- */

  app.get('/login', (c) => {
    if (isAuthenticated(c)) return c.redirect('/admin');
    return c.html(renderLoginPage(ensureCsrf(c)));
  });

  app.post('/login', bodyLimit({ maxSize: LOGIN_BODY_LIMIT }), async (c) => {
    const ip = clientIp(c);
    if (loginLimiter.isBlocked(ip)) {
      return c.html(renderLoginPage(ensureCsrf(c), 'Too many attempts. Try again later.'), 429);
    }
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) {
      return c.html(renderLoginPage(ensureCsrf(c), 'Invalid request. Try again.'), 403);
    }
    const password = formField(body, 'password');
    if (verifyPassword(password, auth.passwordHash, auth.passwordSalt)) {
      loginLimiter.reset(ip);
      setCookie(c, SESSION_COOKIE, createSessionToken(auth.sessionSecret), {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: config.secureCookies,
        maxAge: SESSION_TTL_SECONDS,
      });
      return c.redirect('/admin');
    }
    loginLimiter.record(ip);
    return c.html(renderLoginPage(ensureCsrf(c), 'Incorrect password.'), 401);
  });

  app.post('/logout', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);
    setCookie(c, SESSION_COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.secureCookies,
      maxAge: 0,
    });
    return c.redirect('/login');
  });

  /* --------------------------------- admin ------------------------------- */

  app.get('/admin', (c) => {
    const error = c.req.query('error');
    return c.html(
      renderAdminPage({
        profile: getProfile(db),
        links: listLinks(db),
        theme: getTheme(db),
        csrfToken: ensureCsrf(c),
        saved: c.req.query('ok') !== undefined,
        ...(error !== undefined ? { error } : {}),
      }),
    );
  });

  app.post('/admin/profile', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const current = getProfile(db);
    saveProfile(db, {
      name: formField(body, 'name').trim(),
      tagline: formField(body, 'tagline').trim(),
      description: formField(body, 'description').trim(),
      avatarPath: current.avatarPath,
    });
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/theme', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    // The theme form owns the mode, visitor toggle, and text colours; the
    // favicon and background settings are managed by their own routes and must
    // be preserved.
    const current = getTheme(db);
    const mode = formField(body, 'defaultMode');
    saveTheme(db, {
      ...current,
      defaultMode: isThemeMode(mode) ? mode : current.defaultMode,
      visitorToggle: formField(body, 'visitorToggle') === 'on',
      textDark: formField(body, 'textDark').trim() || current.textDark,
      textLight: formField(body, 'textLight').trim() || current.textLight,
      accentColor: formField(body, 'accentColor').trim() || current.accentColor,
    });
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/avatar', bodyLimit({ maxSize: AVATAR_BODY_LIMIT }), async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const file = body['avatar'];
    if (!(file instanceof File)) return c.redirect('/admin?error=No%20file%20uploaded');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const saved = saveImage(bytes, config.uploadsDir);
      const current = getProfile(db);
      saveProfile(db, { ...current, avatarPath: saved.path });
    } catch (error) {
      const message = error instanceof UploadError ? error.message : 'Upload failed.';
      return c.redirect(`/admin?error=${encodeURIComponent(message)}`);
    }
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/favicon', bodyLimit({ maxSize: IMAGE_BODY_LIMIT }), async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const file = body['favicon'];
    if (!(file instanceof File)) return c.redirect('/admin?error=No%20file%20uploaded');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const saved = saveImage(bytes, config.uploadsDir);
      const theme = getTheme(db);
      deleteUpload(config.uploadsDir, theme.faviconPath);
      saveTheme(db, { ...theme, faviconPath: saved.path });
    } catch (error) {
      const message = error instanceof UploadError ? error.message : 'Upload failed.';
      return c.redirect(`/admin?error=${encodeURIComponent(message)}`);
    }
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/favicon/remove', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);
    const theme = getTheme(db);
    deleteUpload(config.uploadsDir, theme.faviconPath);
    saveTheme(db, { ...theme, faviconPath: DEFAULT_THEME.faviconPath });
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/background', bodyLimit({ maxSize: BACKGROUND_BODY_LIMIT }), async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const slot = themeSlot(formField(body, 'theme'));
    if (slot === undefined) {
      return c.redirect('/admin?error=' + encodeURIComponent('Unknown colour scheme'));
    }
    const file = body['background'];
    if (!(file instanceof File)) return c.redirect('/admin?error=No%20file%20uploaded');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const saved = saveImage(bytes, config.uploadsDir, MAX_BACKGROUND_BYTES);
      const theme = getTheme(db);
      const current = slot === 'dark' ? theme.backgroundImageDark : theme.backgroundImageLight;
      deleteUpload(config.uploadsDir, current.imagePath);
      saveTheme(db, withBackground(theme, slot, { ...current, imagePath: saved.path }));
    } catch (error) {
      const message = error instanceof UploadError ? error.message : 'Upload failed.';
      return c.redirect(`/admin?error=${encodeURIComponent(message)}`);
    }
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/background/remove', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);
    const slot = themeSlot(formField(body, 'theme'));
    if (slot === undefined) {
      return c.redirect('/admin?error=' + encodeURIComponent('Unknown colour scheme'));
    }
    const theme = getTheme(db);
    const current = slot === 'dark' ? theme.backgroundImageDark : theme.backgroundImageLight;
    deleteUpload(config.uploadsDir, current.imagePath);
    saveTheme(db, withBackground(theme, slot, { ...current, imagePath: null }));
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/background/options', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const slot = themeSlot(formField(body, 'theme'));
    if (slot === undefined) {
      return c.redirect('/admin?error=' + encodeURIComponent('Unknown colour scheme'));
    }
    const size = formField(body, 'backgroundSize');
    const position = formField(body, 'backgroundPosition');
    const attachment = formField(body, 'backgroundAttachment');
    if (!isBackgroundSize(size) || !isBackgroundPosition(position) || !isBackgroundAttachment(attachment)) {
      return c.redirect('/admin?error=' + encodeURIComponent('Invalid background option'));
    }
    const repeat = formField(body, 'backgroundRepeat') === 'on' ? 'repeat' : 'no-repeat';
    const theme = getTheme(db);
    const current = slot === 'dark' ? theme.backgroundImageDark : theme.backgroundImageLight;
    const updated: BackgroundSettings = { ...current, size, position, repeat, attachment };
    saveTheme(db, withBackground(theme, slot, updated));
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/links', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const link = parseLinkForm(body);
    if (!isHttpUrl(link.url)) {
      return c.redirect('/admin?error=' + encodeURIComponent('URL must start with http:// or https://'));
    }
    if (link.iconType === 'image' && !isSafeAssetRef(link.iconValue)) {
      return c.redirect(
        '/admin?error=' + encodeURIComponent('Icon image must be a local /assets/ path'),
      );
    }
    const id = Number.parseInt(formField(body, 'id'), 10);
    if (Number.isInteger(id) && id > 0) {
      updateLink(db, id, link);
    } else {
      createLink(db, link);
    }
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/links/:id/delete', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);
    const id = Number.parseInt(c.req.param('id'), 10);
    if (Number.isInteger(id) && id > 0) deleteLink(db, id);
    return c.redirect('/admin?ok=1');
  });

  app.post('/admin/links/reorder', async (c) => {
    const body = await c.req.parseBody();
    if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

    const known = new Set(listLinks(db).map((link) => link.id));
    const ids = formField(body, 'order')
      .split(',')
      .map((value) => Number.parseInt(value, 10))
      .filter((id) => Number.isInteger(id) && known.has(id));
    const unique = new Set(ids);
    if (ids.length === known.size && unique.size === ids.length) reorderLinks(db, ids);
    return c.redirect('/admin?ok=1');
  });

  /* ------------------------------- backup -------------------------------- */

  app.get('/admin/backup', (c) => {
    const archive = buildBackup(db, config.uploadsDir);
    const filename = `profile-page-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
    c.header('Content-Type', 'application/gzip');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Length', String(archive.length));
    return c.body(new Uint8Array(archive));
  });

  app.post(
    '/admin/restore',
    bodyLimit({ maxSize: MAX_ARCHIVE_BYTES + 1024 * 1024 }),
    async (c) => {
      const body = await c.req.parseBody();
      if (!csrfOk(c, formField(body, 'csrf'))) return c.text('Invalid CSRF token', 403);

      const file = body['archive'];
      if (!(file instanceof File)) return c.redirect('/admin?error=No%20archive%20uploaded');
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        restoreBackup(db, config.uploadsDir, bytes);
      } catch (error) {
        const message = error instanceof BackupError ? error.message : 'Restore failed.';
        return c.redirect(`/admin?error=${encodeURIComponent(message)}`);
      }
      return c.redirect('/admin?ok=1');
    },
  );

  /* -------------------------------- assets ------------------------------- */

  // Uploaded files first: /assets/uploads/... -> <DATA_DIR>/uploads/...
  app.use('/assets/uploads/*', async (c, next) => {
    if (!isSafeAssetPath(c.req.path)) return c.notFound();
    await next();
  });
  app.use(
    '/assets/uploads/*',
    serveStatic({
      root: config.dataDir,
      rewriteRequestPath: (path) => path.replace(/^\/assets/, ''),
    }),
  );

  // Bundled assets: /assets/css/... -> <publicDir>/css/...
  app.use(
    '/assets/*',
    serveStatic({
      root: publicDir,
      rewriteRequestPath: (path) => path.replace(/^\/assets/, ''),
    }),
  );

  return app;
}
