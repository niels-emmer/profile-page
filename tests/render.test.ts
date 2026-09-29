import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backgroundValue,
  escapeHtml,
  imageMime,
  renderAdminPage,
  renderLlmsTxt,
  renderLoginPage,
  renderProfilePage,
  renderRobotsTxt,
  renderSitemap,
  sanitizeCss,
} from '../src/render.ts';
import type { BackgroundSettings, Link, Profile, ThemeSettings } from '../src/types.ts';

const noBackground: BackgroundSettings = {
  imagePath: null,
  size: 'cover',
  position: 'center',
  repeat: 'no-repeat',
  attachment: 'scroll',
  color: null,
  opacity: 100,
};

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
  ogImagePath: null,
  backgroundImageDark: { ...noBackground },
  backgroundImageLight: { ...noBackground },
  defaultMode: 'system',
  visitorToggle: false,
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

test('renderProfilePage bakes a forced default theme into the markup', () => {
  const html = renderProfilePage({
    profile,
    links: [],
    theme: { ...theme, defaultMode: 'dark' },
    baseUrl: 'https://example.com',
  });
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /:root\[data-theme='dark'\]\{--bg:#000000;--fg:#ffffff;\}/);
  assert.match(html, /:root:not\(\[data-theme\]\)\{--bg:#000000;--fg:#ffffff;\}/);
});

test('renderProfilePage follows the OS when the default is system', () => {
  const html = renderProfilePage({ profile, links: [], theme, baseUrl: 'https://example.com' });
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /data-theme="/);
});

test('renderProfilePage renders the switcher only when visitor selection is on', () => {
  const off = renderProfilePage({ profile, links: [], theme, baseUrl: 'https://example.com' });
  assert.doesNotMatch(off, /data-theme-switcher/);
  assert.doesNotMatch(off, /theme\.js/);

  const on = renderProfilePage({
    profile,
    links: [],
    theme: { ...theme, visitorToggle: true },
    baseUrl: 'https://example.com',
  });
  assert.match(on, /<html lang="en" data-theme-toggle="on">/);
  assert.match(on, /data-theme-switcher/);
  assert.match(on, /data-theme-value="light"/);
  assert.match(on, /data-theme-value="dark"/);
  assert.match(on, /data-theme-value="system"/);
  assert.match(on, /<script src="\/assets\/js\/theme\.js"><\/script>/);
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

test('renderProfilePage prefers the preview image for og:image and twitter:image', () => {
  const html = renderProfilePage({
    profile,
    links: [],
    theme: { ...theme, ogImagePath: '/assets/uploads/preview.png' },
    baseUrl: 'https://example.com',
  });
  assert.match(html, /og:image" content="https:\/\/example\.com\/assets\/uploads\/preview\.png"/);
  assert.match(html, /twitter:image" content="https:\/\/example\.com\/assets\/uploads\/preview\.png"/);
});

test('renderProfilePage renders image and font-awesome icons', () => {
  const imageLink: Link = { ...link, iconType: 'image', iconValue: '/assets/uploads/icon.svg' };
  const html = renderProfilePage({ profile, links: [imageLink, link], theme, baseUrl: 'https://example.com' });
  assert.match(html, /<img alt="" class="icon hvr-icon" src="\/assets\/uploads\/icon\.svg">/);
  assert.match(html, /class="icon hvr-icon fa-brands fa-github"/);
});

test('imageMime maps the file extension to a MIME type', () => {
  assert.equal(imageMime('/assets/favicon.png'), 'image/png');
  assert.equal(imageMime('/assets/uploads/x.jpg'), 'image/jpeg');
  assert.equal(imageMime('/assets/uploads/x.jpeg'), 'image/jpeg');
  assert.equal(imageMime('/assets/uploads/x.webp'), 'image/webp');
  assert.equal(imageMime('/assets/uploads/x.svg'), 'image/svg+xml');
  assert.equal(imageMime('/assets/uploads/x'), 'image/png');
});

test('backgroundValue layers the image over the base and defaults to the base alone', () => {
  assert.equal(backgroundValue('#000000', noBackground), '#000000');
  const layered = backgroundValue('#000000', {
    imagePath: '/assets/uploads/bg.webp',
    size: 'stretch',
    position: 'top left',
    repeat: 'repeat',
    attachment: 'fixed',
    color: null,
    opacity: 100,
  });
  assert.equal(
    layered,
    'url(/assets/uploads/bg.webp) top left/100% 100% repeat fixed, #000000',
  );
});

test('backgroundValue uses the colour behind the image and fades it by opacity', () => {
  const opaque = backgroundValue('#000000', {
    ...noBackground,
    imagePath: '/assets/uploads/bg.webp',
    color: '#112233',
  });
  assert.equal(opaque, 'url(/assets/uploads/bg.webp) center/cover no-repeat scroll, #112233');

  const faded = backgroundValue('#000000', {
    ...noBackground,
    imagePath: '/assets/uploads/bg.webp',
    color: '#112233',
    opacity: 40,
  });
  assert.equal(
    faded,
    'linear-gradient(rgba(17, 34, 51, 0.6), rgba(17, 34, 51, 0.6)), url(/assets/uploads/bg.webp) center/cover no-repeat scroll, #112233',
  );
});

test('backgroundValue uses the colour as the base when there is no image', () => {
  assert.equal(backgroundValue('#000000', { ...noBackground, color: '#112233' }), '#112233');
});

test('renderProfilePage emits the favicon MIME, apple-touch-icon, and background layer', () => {
  const html = renderProfilePage({
    profile,
    links: [],
    theme: {
      ...theme,
      faviconPath: '/assets/uploads/fav.webp',
      backgroundImageDark: { ...noBackground, imagePath: '/assets/uploads/dark.webp' },
    },
    baseUrl: 'https://example.com',
  });
  assert.match(html, /<link rel="icon" type="image\/webp" href="\/assets\/uploads\/fav\.webp">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/uploads\/fav\.webp">/);
  assert.match(html, /--bg:url\(\/assets\/uploads\/dark\.webp\) center\/cover no-repeat scroll, #000000/);
});

test('renderProfilePage emits canonical, theme-color, and Person JSON-LD', () => {
  const html = renderProfilePage({ profile, links: [link], theme, baseUrl: 'https://example.com' });
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/">/);
  assert.match(html, /<meta name="theme-color" content="#0085ff">/);
  assert.match(html, /<link rel="alternate" type="text\/vcard" href="\/contact\.vcf">/);
  assert.match(html, /<link rel="alternate" type="application\/json" href="\/contact\.json">/);
  assert.match(html, /<link rel="me" href="https:\/\/github\.com\/example">/);
  assert.match(html, /<p class="contact-link"><a href="\/contact\.vcf">Add to contacts<\/a><\/p>/);
  assert.match(html, /<script type="application\/ld\+json">/);
  const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? '';
  const data = JSON.parse(json) as { '@type': string; name: string; url: string; sameAs: string[] };
  assert.equal(data['@type'], 'Person');
  assert.equal(data.name, 'Test <User>');
  assert.equal(data.url, 'https://example.com/');
  assert.deepEqual(data.sameAs, ['https://github.com/example']);
});

test('JSON-LD cannot break out of the script element', () => {
  const html = renderProfilePage({
    profile: { ...profile, name: '</script><script>alert(1)</script>' },
    links: [],
    theme,
    baseUrl: 'https://example.com',
  });
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.match(html, /\\u003c\/script>/);
});

test('renderRobotsTxt allows the page and points at the sitemap', () => {
  const txt = renderRobotsTxt('https://example.com');
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Disallow: \/admin/);
  assert.match(txt, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
});

test('renderSitemap lists the canonical URL', () => {
  const xml = renderSitemap('https://example.com');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/example\.com\/<\/loc>/);
});

test('renderLlmsTxt summarises the profile and links', () => {
  const txt = renderLlmsTxt(profile, [link], 'https://example.com');
  assert.match(txt, /^# Test <User>/);
  assert.match(txt, /- \[GitHub\]\(https:\/\/github\.com\/example\)/);
  assert.match(txt, /Canonical page: https:\/\/example\.com\//);
});

test('renderLlmsTxt escapes markdown-breaking characters', () => {
  const txt = renderLlmsTxt(
    { ...profile, name: 'A\nB' },
    [{ ...link, text: 'Bad](x) [link' }],
    'https://example.com',
  );
  assert.match(txt, /^# A B/);
  assert.match(txt, /- \[Badx link\]\(https:\/\/github\.com\/example\)/);
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
    passwordManagedByEnv: false,
  });
  assert.match(html, /action="\/admin\/profile"/);
  assert.match(html, /action="\/admin\/theme"/);
  assert.match(html, /name="defaultMode"/);
  assert.match(html, /name="visitorToggle"/);
  assert.match(html, /action="\/admin\/avatar"/);
  assert.match(html, /action="\/admin\/links"/);
  assert.match(html, /action="\/admin\/links\/1\/delete"/);
  assert.match(html, /action="\/admin\/links\/reorder"/);
  assert.match(html, /action="\/admin\/ogimage"/);
  assert.match(html, /action="\/admin\/password"/);
  assert.match(html, /Saved\./);
  assert.match(html, /GitHub/);
});

test('renderAdminPage includes the favicon, background, and drag-reorder controls', () => {
  const html = renderAdminPage({
    profile,
    links: [link],
    theme: {
      ...theme,
      faviconPath: '/assets/uploads/fav.png',
      backgroundImageDark: { ...noBackground, imagePath: '/assets/uploads/dark.webp' },
    },
    csrfToken: 'token-123',
    saved: false,
    passwordManagedByEnv: false,
  });
  assert.match(html, /action="\/admin\/favicon"/);
  assert.match(html, /action="\/admin\/favicon\/remove"/);
  assert.match(html, /action="\/admin\/background"/);
  assert.match(html, /action="\/admin\/background\/options"/);
  assert.match(html, /name="backgroundSize"/);
  assert.match(html, /name="backgroundPosition"/);
  assert.match(html, /name="backgroundAttachment"/);
  assert.match(html, /class="link-list" data-reorder-url="\/admin\/links\/reorder"/);
  assert.match(html, /class="drag-handle"/);
  assert.match(html, /data-id="1"/);
});
