import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  escapeHtml,
  renderAdminPage,
  renderLoginPage,
  renderProfilePage,
  sanitizeCss,
} from '../src/render.ts';
import type { Link, Profile, ThemeSettings } from '../src/types.ts';

const profile: Profile = {
  name: 'Test <User>',
  tagline: 'Tag & line',
  description: 'Desc "quoted"',
  avatarPath: null,
};

const theme: ThemeSettings = {
  backgroundDark: '#000000',
  backgroundLight: '#ffffff',
  textDark: '#ffffff',
  textLight: '#222222',
  accentColor: '#0085ff',
  faviconPath: '/assets/favicon.png',
};

const link: Link = {
  id: 1,
  position: 0,
  text: 'GitHub',
  url: 'https://github.com/example',
  newWindow: true,
  iconType: 'fa',
  iconValue: 'fa-brands fa-github',
  iconColor: null,
  textColor: '#ffffff',
  colorMode: 'solid',
  colorFrom: '#0085ff',
  colorTo: '#0085ff',
  borderColor: null,
};

test('escapeHtml escapes every special character', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('sanitizeCss strips markup and url() payloads', () => {
  const cleaned = sanitizeCss('</style><script>alert(1)</script>');
  assert.ok(!cleaned.includes('<') && !cleaned.includes('>'));
  assert.equal(sanitizeCss('url(javascript:alert(1))'), 'url(javascriptalert(1))');
});

test('sanitizeCss preserves a local background shorthand', () => {
  const value = 'url(/assets/uploads/background.jpg) center/cover no-repeat fixed';
  assert.equal(sanitizeCss(value), value);
});

test('renderProfilePage includes content, escapes it, and applies the theme', () => {
  const html = renderProfilePage({ profile, links: [link], theme, baseUrl: 'https://example.com' });
  assert.match(html, /Test &lt;User&gt;/);
  assert.match(html, /Tag &amp; line/);
  assert.match(html, /Desc &quot;quoted&quot;/);
  assert.match(html, /href="https:\/\/github\.com\/example"/);
  assert.match(html, /--accent:#0085ff/);
  assert.match(html, /\/assets\/default-avatar\.svg/);
  assert.match(html, /class="badge"/);
});

test('renderProfilePage uses an uploaded avatar for the image and og:image', () => {
  const html = renderProfilePage({
    profile: { ...profile, avatarPath: '/assets/uploads/avatar.jpg' },
    links: [],
    theme,
    baseUrl: 'https://example.com',
  });
  assert.match(html, /src="\/assets\/uploads\/avatar\.jpg"/);
  assert.match(html, /og:image" content="https:\/\/example\.com\/assets\/uploads\/avatar\.jpg"/);
});

test('renderProfilePage renders image and font-awesome icons', () => {
  const imageLink: Link = { ...link, iconType: 'image', iconValue: '/assets/uploads/icon.svg' };
  const html = renderProfilePage({ profile, links: [imageLink, link], theme, baseUrl: 'https://example.com' });
  assert.match(html, /<img alt="" class="icon hvr-icon" src="\/assets\/uploads\/icon\.svg">/);
  assert.match(html, /class="icon hvr-icon fa-brands fa-github"/);
});

test('renderLoginPage includes the CSRF token and error message', () => {
  const html = renderLoginPage('token-123', 'Incorrect password.');
  assert.match(html, /name="csrf" value="token-123"/);
  assert.match(html, /Incorrect password\./);
});

test('renderAdminPage includes every form and the saved banner', () => {
  const html = renderAdminPage({
    profile,
    links: [link],
    theme,
    csrfToken: 'token-123',
    saved: true,
  });
  assert.match(html, /action="\/admin\/profile"/);
  assert.match(html, /action="\/admin\/avatar"/);
  assert.match(html, /action="\/admin\/links"/);
  assert.match(html, /action="\/admin\/links\/1\/delete"/);
  assert.match(html, /action="\/admin\/links\/reorder"/);
  assert.match(html, /Saved\./);
  assert.match(html, /GitHub/);
});
