import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { deleteLink, ensureSeeded, getProfile, getTheme, listLinks } from '../src/db.ts';
import { createTar, readTar } from '../src/tar.ts';
import { MAX_UPLOAD_BYTES } from '../src/upload.ts';
import { FORM_HEADERS, cookieHeader, cookiesFrom, formBody, login, makeTestApp } from './helpers.ts';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001a5f645400000000049454e44ae426082',
  'hex',
);

test('GET /health returns ok', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/health');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('a fresh database is seeded with the default demo profile', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  assert.equal(getProfile(ctx.db).name, 'Alex Rivera');
  assert.equal(listLinks(ctx.db).length, 6);

  const res = await ctx.app.request('/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Alex Rivera/);
  assert.match(html, /default-avatar\.svg/);
  assert.match(html, /\/assets\/icons\/github\.svg/);
});

test('seeding is idempotent and preserves later edits', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());

  ensureSeeded(ctx.db);
  assert.equal(listLinks(ctx.db).length, 6);

  // Simulate the user deleting every link: a restart must not re-add them.
  for (const link of listLinks(ctx.db)) deleteLink(ctx.db, link.id);
  ensureSeeded(ctx.db);
  assert.equal(listLinks(ctx.db).length, 0);
});

test('crawler files are served with the right content types', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());

  const robots = await ctx.app.request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type') ?? '', /text\/plain/);
  assert.match(await robots.text(), /Sitemap: .*\/sitemap\.xml/);

  const sitemap = await ctx.app.request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') ?? '', /application\/xml/);
  assert.match(await sitemap.text(), /<loc>.*<\/loc>/);

  const llms = await ctx.app.request('/llms.txt');
  assert.equal(llms.status, 200);
  assert.match(llms.headers.get('content-type') ?? '', /text\/plain/);
  assert.match(await llms.text(), /^# Alex Rivera/);
});

test('contact endpoints serve a vCard, JSON, and WebFinger', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());

  const vcf = await ctx.app.request('/contact.vcf');
  assert.equal(vcf.status, 200);
  assert.match(vcf.headers.get('content-type') ?? '', /text\/vcard/);
  assert.match(vcf.headers.get('content-disposition') ?? '', /attachment; filename="alex-rivera\.vcf"/);
  const vcfBody = await vcf.text();
  assert.match(vcfBody, /BEGIN:VCARD/);
  assert.match(vcfBody, /FN:Alex Rivera/);

  const json = await ctx.app.request('/contact.json');
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(json.headers.get('access-control-allow-origin'), '*');
  assert.equal((JSON.parse(await json.text()) as { name: string }).name, 'Alex Rivera');

  const wf = await ctx.app.request('/.well-known/webfinger?resource=acct:me@localhost');
  assert.equal(wf.status, 200);
  assert.match(wf.headers.get('content-type') ?? '', /application\/jrd\+json/);
  assert.equal((JSON.parse(await wf.text()) as { subject: string }).subject, 'acct:me@localhost');

  const unknown = await ctx.app.request('/.well-known/webfinger?resource=acct:someone@else.com');
  assert.equal(unknown.status, 404);

  const missing = await ctx.app.request('/.well-known/webfinger');
  assert.equal(missing.status, 400);
});

test('a malformed x-forwarded-host falls back to the request host', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/contact.json', {
    headers: { 'x-forwarded-host': ' ' },
  });
  const data = JSON.parse(await res.text()) as { url: string };
  assert.ok(data.url.includes('localhost'), `unexpected url: ${data.url}`);
});

test('the homepage advertises the contact representations via Link headers', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/');
  const link = res.headers.get('link') ?? '';
  assert.match(link, /<\/contact\.vcf>; rel="alternate"; type="text\/vcard"/);
  assert.match(link, /<\/contact\.json>; rel="alternate"; type="application\/json"/);
});

test('security headers are set on every response', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('HSTS is only sent when secure cookies are enabled', async (t) => {
  const insecure = makeTestApp({ secureCookies: false });
  const secure = makeTestApp({ secureCookies: true });
  t.after(() => {
    insecure.cleanup();
    secure.cleanup();
  });
  assert.equal((await insecure.app.request('/')).headers.get('strict-transport-security'), null);
  assert.match(
    (await secure.app.request('/')).headers.get('strict-transport-security') ?? '',
    /max-age=31536000/,
  );
});

test('GET /admin redirects to /login when unauthenticated', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('login rejects a bad CSRF token, a wrong password, then accepts the right one', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());

  const page = await ctx.app.request('/login');
  const jar = cookiesFrom(page);
  const csrf = jar['csrf'] ?? '';
  assert.ok(csrf.length > 0);

  const badCsrf = await ctx.app.request('/login', {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), ...FORM_HEADERS },
    body: formBody({ csrf: 'not-the-token', password: 'test-password' }),
  });
  assert.equal(badCsrf.status, 403);

  const wrong = await ctx.app.request('/login', {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), ...FORM_HEADERS },
    body: formBody({ csrf, password: 'nope' }),
  });
  assert.equal(wrong.status, 401);

  const ok = await ctx.app.request('/login', {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), ...FORM_HEADERS },
    body: formBody({ csrf, password: 'test-password' }),
  });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/admin');
  const session = cookiesFrom(ok)['session'] ?? '';
  assert.ok(session.length > 0);

  const admin = await ctx.app.request('/admin', { headers: { cookie: `session=${session}` } });
  assert.equal(admin.status, 200);
});

test('admin POSTs reject a missing CSRF token', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const res = await ctx.app.request('/admin/profile', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS },
    body: formBody({ csrf: 'wrong', name: 'x' }),
  });
  assert.equal(res.status, 403);
});

test('admin can edit the profile and it appears on the public page', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS };

  const res = await ctx.app.request('/admin/profile', {
    method: 'POST',
    headers,
    body: formBody({
      csrf,
      name: 'Route Test',
      tagline: 'Tagline',
      description: 'Description',
      backgroundDark: '#111111',
      backgroundLight: '#ffffff',
      textDark: '#ffffff',
      textLight: '#222222',
      accentColor: '#0085ff',
      faviconPath: '/assets/favicon.png',
    }),
  });
  assert.equal(res.status, 302);

  const html = await (await ctx.app.request('/')).text();
  assert.match(html, /Route Test/);
  assert.match(html, /Tagline/);
});

test('admin can add, edit, reorder, and delete links', async (t) => {
  const ctx = makeTestApp({ seed: false });
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS };

  const add = async (text: string, url: string) =>
    ctx.app.request('/admin/links', {
      method: 'POST',
      headers,
      body: formBody({
        csrf,
        text,
        url,
        iconType: 'fa',
        iconValue: 'fa-link',
        textColor: '#ffffff',
        colorMode: 'solid',
        colorFrom: '#0085ff',
        colorTo: '#0085ff',
      }),
    });

  assert.equal((await add('One', 'https://one.example')).status, 302);
  assert.equal((await add('Two', 'https://two.example')).status, 302);

  const links = listLinks(ctx.db);
  assert.equal(links.length, 2);
  const [first, second] = links;
  assert.ok(first !== undefined && second !== undefined);

  const edit = await ctx.app.request('/admin/links', {
    method: 'POST',
    headers,
    body: formBody({
      csrf,
      id: String(first.id),
      text: 'One edited',
      url: 'https://one.example/edited',
      iconType: 'fa',
      iconValue: 'fa-link',
      textColor: '#ffffff',
      colorMode: 'solid',
      colorFrom: '#0085ff',
      colorTo: '#0085ff',
    }),
  });
  assert.equal(edit.status, 302);
  assert.equal(listLinks(ctx.db).find((l) => l.id === first.id)?.text, 'One edited');

  const reorder = await ctx.app.request('/admin/links/reorder', {
    method: 'POST',
    headers,
    body: formBody({ csrf, order: `${second.id},${first.id}` }),
  });
  assert.equal(reorder.status, 302);
  assert.equal(listLinks(ctx.db)[0]?.id, second.id);

  const remove = await ctx.app.request(`/admin/links/${second.id}/delete`, {
    method: 'POST',
    headers,
    body: formBody({ csrf }),
  });
  assert.equal(remove.status, 302);
  assert.equal(listLinks(ctx.db).length, 1);
});

test('admin rejects non-http(s) link URLs', async (t) => {
  const ctx = makeTestApp({ seed: false });
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const res = await ctx.app.request('/admin/links', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS },
    body: formBody({ csrf, text: 'Bad', url: 'javascript:alert(1)' }),
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /error=/);
  assert.equal(listLinks(ctx.db).length, 0);
});

test('logout clears the session', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const res = await ctx.app.request('/logout', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS },
    body: formBody({ csrf }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
  assert.match(res.headers.getSetCookie().join(';'), /session=;/);
});

test('login rate limit trips after five failures for the same client', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const page = await ctx.app.request('/login');
  const jar = cookiesFrom(page);
  const csrf = jar['csrf'] ?? '';
  const headers = {
    cookie: cookieHeader(jar),
    'x-forwarded-for': '203.0.113.7',
    ...FORM_HEADERS,
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await ctx.app.request('/login', {
      method: 'POST',
      headers,
      body: formBody({ csrf, password: 'wrong' }),
    });
    assert.equal(res.status, 401, `attempt ${attempt}`);
  }
  const blocked = await ctx.app.request('/login', {
    method: 'POST',
    headers,
    body: formBody({ csrf, password: 'test-password' }),
  });
  assert.equal(blocked.status, 429);
});

test('uploaded asset paths reject traversal', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  for (const path of [
    '/assets/uploads/../../etc/passwd',
    '/assets/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/assets/uploads/..%5c..%5cetc%5cpasswd',
  ]) {
    const res = await ctx.app.request(path);
    assert.equal(res.status, 404, path);
  }
});

test('bundled assets are served', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const res = await ctx.app.request('/assets/css/style.css');
  assert.equal(res.status, 200);
});

test('logout rejects a missing CSRF token', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const res = await ctx.app.request('/logout', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS },
    body: formBody({ csrf: 'wrong' }),
  });
  assert.equal(res.status, 403);
});

test('admin can upload an avatar and it is served', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const form = new FormData();
  form.set('csrf', csrf);
  form.set('avatar', new File([PNG], 'avatar.png', { type: 'image/png' }));

  const res = await ctx.app.request('/admin/avatar', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}` },
    body: form,
  });
  assert.equal(res.status, 302);

  const avatarPath = getProfile(ctx.db).avatarPath;
  assert.ok(avatarPath !== null && avatarPath.startsWith('/assets/uploads/'));
  assert.equal((await ctx.app.request(avatarPath)).status, 200);
});

test('admin avatar upload rejects a non-image and an oversized file', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}` };

  const notImage = new FormData();
  notImage.set('csrf', csrf);
  notImage.set('avatar', new File([Buffer.from('not an image')], 'x.png', { type: 'image/png' }));
  const rejected = await ctx.app.request('/admin/avatar', { method: 'POST', headers, body: notImage });
  assert.equal(rejected.status, 302);
  assert.match(rejected.headers.get('location') ?? '', /error=/);

  const oversized = new FormData();
  oversized.set('csrf', csrf);
  oversized.set('avatar', new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.png', { type: 'image/png' }));
  const tooBig = await ctx.app.request('/admin/avatar', { method: 'POST', headers, body: oversized });
  assert.equal(tooBig.status, 302);
  assert.match(tooBig.headers.get('location') ?? '', /error=/);

  assert.equal(getProfile(ctx.db).avatarPath, null);
});

test('admin can upload and remove a favicon', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}` };

  const form = new FormData();
  form.set('csrf', csrf);
  form.set('favicon', new File([PNG], 'favicon.png', { type: 'image/png' }));
  const uploaded = await ctx.app.request('/admin/favicon', { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 302);

  const faviconPath = getTheme(ctx.db).faviconPath;
  assert.ok(faviconPath.startsWith('/assets/uploads/'));
  assert.equal((await ctx.app.request(faviconPath)).status, 200);

  const removed = await ctx.app.request('/admin/favicon/remove', {
    method: 'POST',
    headers: { ...headers, ...FORM_HEADERS },
    body: formBody({ csrf }),
  });
  assert.equal(removed.status, 302);
  assert.equal(getTheme(ctx.db).faviconPath, '/assets/favicon.png');
  assert.equal((await ctx.app.request(faviconPath)).status, 404);
});

test('admin can upload, configure, and remove a per-theme background', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}` };

  const form = new FormData();
  form.set('csrf', csrf);
  form.set('theme', 'dark');
  form.set('background', new File([PNG], 'bg.png', { type: 'image/png' }));
  const uploaded = await ctx.app.request('/admin/background', { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 302);

  const dark = getTheme(ctx.db).backgroundImageDark;
  assert.ok(dark.imagePath !== null && dark.imagePath.startsWith('/assets/uploads/'));
  assert.equal(getTheme(ctx.db).backgroundImageLight.imagePath, null);

  const options = await ctx.app.request('/admin/background/options', {
    method: 'POST',
    headers: { ...headers, ...FORM_HEADERS },
    body: formBody({
      csrf,
      theme: 'dark',
      backgroundSize: 'contain',
      backgroundPosition: 'bottom right',
      backgroundRepeat: 'on',
      backgroundAttachment: 'fixed',
    }),
  });
  assert.equal(options.status, 302);
  const configured = getTheme(ctx.db).backgroundImageDark;
  assert.equal(configured.size, 'contain');
  assert.equal(configured.position, 'bottom right');
  assert.equal(configured.repeat, 'repeat');
  assert.equal(configured.attachment, 'fixed');

  const invalid = await ctx.app.request('/admin/background/options', {
    method: 'POST',
    headers: { ...headers, ...FORM_HEADERS },
    body: formBody({ csrf, theme: 'dark', backgroundSize: 'nonsense', backgroundPosition: 'center', backgroundAttachment: 'scroll' }),
  });
  assert.equal(invalid.status, 302);
  assert.match(invalid.headers.get('location') ?? '', /error=/);
  assert.equal(getTheme(ctx.db).backgroundImageDark.size, 'contain');

  const removed = await ctx.app.request('/admin/background/remove', {
    method: 'POST',
    headers: { ...headers, ...FORM_HEADERS },
    body: formBody({ csrf, theme: 'dark' }),
  });
  assert.equal(removed.status, 302);
  assert.equal(getTheme(ctx.db).backgroundImageDark.imagePath, null);
});

test('saving the profile preserves the favicon and background settings', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}` };

  const form = new FormData();
  form.set('csrf', csrf);
  form.set('theme', 'light');
  form.set('background', new File([PNG], 'bg.png', { type: 'image/png' }));
  await ctx.app.request('/admin/background', { method: 'POST', headers, body: form });
  const before = getTheme(ctx.db);

  const res = await ctx.app.request('/admin/profile', {
    method: 'POST',
    headers: { ...headers, ...FORM_HEADERS },
    body: formBody({ csrf, name: 'Kept', tagline: 'T', description: 'D', textDark: '#ffffff', textLight: '#222222', accentColor: '#0085ff' }),
  });
  assert.equal(res.status, 302);
  const after = getTheme(ctx.db);
  assert.equal(after.faviconPath, before.faviconPath);
  assert.equal(after.backgroundImageLight.imagePath, before.backgroundImageLight.imagePath);
  assert.equal(getProfile(ctx.db).name, 'Kept');
});

test('new admin image routes reject a missing CSRF token', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { session } = await login(ctx.app);
  for (const path of ['/admin/favicon', '/admin/favicon/remove', '/admin/background', '/admin/background/remove', '/admin/background/options']) {
    const res = await ctx.app.request(path, {
      method: 'POST',
      headers: { cookie: `session=${session}`, ...FORM_HEADERS },
      body: formBody({ csrf: 'wrong' }),
    });
    assert.equal(res.status, 403, path);
  }
});

test('admin rejects a non-local image icon path', async (t) => {
  const ctx = makeTestApp({ seed: false });
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const res = await ctx.app.request('/admin/links', {
    method: 'POST',
    headers: { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS },
    body: formBody({
      csrf,
      text: 'Bad icon',
      url: 'https://example.com',
      iconType: 'image',
      iconValue: 'https://evil.example/i.png',
    }),
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /error=/);
  assert.equal(listLinks(ctx.db).length, 0);
});

test('GET /admin/backup returns a downloadable archive and requires auth', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());

  const anonymous = await ctx.app.request('/admin/backup');
  assert.equal(anonymous.status, 302);
  assert.equal(anonymous.headers.get('location'), '/login');

  const { session } = await login(ctx.app);
  const res = await ctx.app.request('/admin/backup', { headers: { cookie: `session=${session}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="profile-page-backup-/);
  const entries = readTar(gunzipSync(Buffer.from(await res.arrayBuffer())));
  assert.ok(entries.some((entry) => entry.name === 'seed.json'));
});

test('POST /admin/restore applies a backup and rejects an invalid one', async (t) => {
  const ctx = makeTestApp();
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}` };

  const seed = {
    profile: { name: 'Restored Name', tagline: 'T', description: 'D', avatarPath: null },
    theme: {
      backgroundDark: '#000000',
      backgroundLight: '#ffffff',
      textDark: '#ffffff',
      textLight: '#222222',
      accentColor: '#0085ff',
      faviconPath: '/assets/favicon.png',
    },
    links: [
      {
        text: 'Restored Link',
        url: 'https://restored.example',
        newWindow: true,
        iconType: 'fa',
        iconValue: 'fa-link',
        iconColor: null,
        textColor: '#ffffff',
        colorMode: 'solid',
        colorFrom: '#000000',
        colorTo: '#000000',
        borderColor: null,
      },
    ],
  };
  const archive = gzipSync(createTar([{ name: 'seed.json', data: Buffer.from(JSON.stringify(seed)) }]));

  const good = new FormData();
  good.set('csrf', csrf);
  good.set('archive', new File([archive], 'backup.tar.gz', { type: 'application/gzip' }));
  const restored = await ctx.app.request('/admin/restore', { method: 'POST', headers, body: good });
  assert.equal(restored.status, 302);
  assert.equal(getProfile(ctx.db).name, 'Restored Name');
  assert.equal(listLinks(ctx.db).length, 1);

  const bad = new FormData();
  bad.set('csrf', csrf);
  bad.set('archive', new File([Buffer.from('not a tarball')], 'bad.tar.gz', { type: 'application/gzip' }));
  const rejected = await ctx.app.request('/admin/restore', { method: 'POST', headers, body: bad });
  assert.equal(rejected.status, 302);
  assert.match(rejected.headers.get('location') ?? '', /error=/);
  assert.equal(getProfile(ctx.db).name, 'Restored Name');
});

test('reorder ignores duplicate ids', async (t) => {
  const ctx = makeTestApp({ seed: false });
  t.after(() => ctx.cleanup());
  const { csrf, session } = await login(ctx.app);
  const headers = { cookie: `session=${session}; csrf=${csrf}`, ...FORM_HEADERS };
  const add = (text: string) =>
    ctx.app.request('/admin/links', {
      method: 'POST',
      headers,
      body: formBody({ csrf, text, url: `https://${text}.example`, iconType: 'fa', iconValue: 'fa-link' }),
    });
  await add('one');
  await add('two');
  const before = listLinks(ctx.db).map((link) => link.id);

  const res = await ctx.app.request('/admin/links/reorder', {
    method: 'POST',
    headers,
    body: formBody({ csrf, order: `${before[0]},${before[0]}` }),
  });
  assert.equal(res.status, 302);
  assert.deepEqual(listLinks(ctx.db).map((link) => link.id), before);
});
