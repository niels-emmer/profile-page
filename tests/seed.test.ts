import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { getEntity, getProfile, getTheme, listLinks, openDatabase } from '../src/db.ts';
import { applySeed, parseSeed, validateSeed } from '../src/seed-file.ts';
import type { SeedFile } from '../src/types.ts';

const seed: SeedFile = {
  profile: {
    name: 'Seed Name',
    tagline: 'Tagline',
    description: 'Description',
    avatarPath: '/assets/uploads/avatar.jpg',
  },
  theme: {
    backgroundDark: '#000000',
    backgroundLight: '#ffffff',
    textDark: '#ffffff',
    textLight: '#222222',
    accentColor: '#0085ff',
    faviconPath: '/assets/favicon.png',
    ogImagePath: '/assets/uploads/preview.png',
    backgroundImageDark: {
      imagePath: '/assets/uploads/dark.webp',
      size: 'contain',
      position: 'bottom right',
      repeat: 'repeat',
      attachment: 'fixed',
      color: '#112233',
      opacity: 60,
    },
    backgroundImageLight: {
      imagePath: null,
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
      attachment: 'scroll',
      color: null,
      opacity: 100,
    },
    defaultMode: 'dark',
    visitorToggle: true,
  },
  entity: {
    alternateName: 'Seed Alias',
    jobTitle: 'Seed Job',
    worksFor: 'Seed Org',
    alumniOf: ['Seed University'],
    knowsAbout: ['Seeding'],
    email: 'seed@example.com',
    telephone: '+31 6 12345678',
  },
  links: [
    {
      text: 'One',
      url: 'https://one.example',
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
    {
      text: 'Two',
      url: 'https://two.example',
      newWindow: false,
      iconType: 'image',
      iconValue: '/assets/uploads/icon.svg',
      iconColor: null,
      textColor: '#ffffff',
      colorMode: 'gradient',
      colorFrom: '#111111',
      colorTo: '#222222',
      borderColor: '#ffffff',
    },
  ],
};

test('parseSeed rejects malformed input', () => {
  assert.throws(() => parseSeed(null));
  assert.throws(() => parseSeed({}));
  assert.throws(() => parseSeed({ profile: {}, theme: {} }));
  assert.throws(() => parseSeed({ profile: {}, theme: {}, links: 'nope' }));
});

test('validateSeed rejects bad URLs and non-local asset paths', () => {
  const first = seed.links[0]!;
  const second = seed.links[1]!;
  assert.throws(() => validateSeed({ ...seed, links: [{ ...first, url: 'javascript:alert(1)' }] }));
  assert.throws(() =>
    validateSeed({ ...seed, theme: { ...seed.theme, faviconPath: 'https://evil.example/f.ico' } }),
  );
  assert.throws(() =>
    validateSeed({ ...seed, theme: { ...seed.theme, ogImagePath: 'https://evil.example/p.png' } }),
  );
  assert.throws(() =>
    validateSeed({ ...seed, profile: { ...seed.profile, avatarPath: 'https://evil.example/a.jpg' } }),
  );
  assert.throws(() => validateSeed({ ...seed, links: [{ ...second, iconValue: 'https://evil.example/i.png' }] }));
  assert.throws(() =>
    validateSeed({
      ...seed,
      theme: {
        ...seed.theme,
        backgroundImageDark: { ...seed.theme.backgroundImageDark, imagePath: 'https://evil.example/bg.jpg' },
      },
    }),
  );
});

test('parseSeed fills defaults for a theme from an older backup', () => {
  const parsed = parseSeed({
    profile: seed.profile,
    theme: {
      backgroundDark: '#000000',
      backgroundLight: '#ffffff',
      textDark: '#ffffff',
      textLight: '#222222',
      accentColor: '#0085ff',
      faviconPath: '/assets/favicon.png',
    },
    links: [],
  });
  assert.equal(parsed.theme.backgroundImageDark.imagePath, null);
  assert.equal(parsed.theme.backgroundImageDark.size, 'cover');
  assert.equal(parsed.theme.backgroundImageLight.attachment, 'scroll');
  assert.equal(parsed.theme.backgroundImageDark.color, null);
  assert.equal(parsed.theme.backgroundImageDark.opacity, 100);
  assert.equal(parsed.theme.ogImagePath, null);
  assert.equal(parsed.theme.defaultMode, 'system');
  assert.equal(parsed.theme.visitorToggle, false);
});

test('applySeed replaces the profile, theme, and links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-seed-'));
  try {
    const config = loadConfig({ DATA_DIR: dir, ADMIN_PASSWORD: 'x' });
    const db = openDatabase(config);

    applySeed(db, seed);
    assert.equal(getProfile(db).name, 'Seed Name');
    assert.equal(getProfile(db).avatarPath, '/assets/uploads/avatar.jpg');
    assert.equal(getTheme(db).accentColor, '#0085ff');
    assert.equal(getTheme(db).defaultMode, 'dark');
    assert.equal(getTheme(db).visitorToggle, true);
    assert.equal(getTheme(db).ogImagePath, '/assets/uploads/preview.png');
    assert.equal(getTheme(db).backgroundImageDark.color, '#112233');
    assert.equal(getTheme(db).backgroundImageDark.opacity, 60);

    const links = listLinks(db);
    assert.equal(links.length, 2);
    assert.equal(links[0]?.text, 'One');
    assert.equal(links[1]?.borderColor, '#ffffff');

    const entity = getEntity(db);
    assert.equal(entity.jobTitle, 'Seed Job');
    assert.equal(entity.worksFor, 'Seed Org');
    assert.deepEqual(entity.alumniOf, ['Seed University']);
    assert.deepEqual(entity.knowsAbout, ['Seeding']);
    assert.equal(entity.email, 'seed@example.com');
    assert.equal(entity.telephone, '+31 6 12345678');

    // Re-applying replaces rather than appends.
    applySeed(db, { ...seed, links: [seed.links[0]!] });
    assert.equal(listLinks(db).length, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseSeed fills empty identity fields from an older backup', () => {
  const parsed = parseSeed({ profile: seed.profile, theme: seed.theme, links: [] });
  assert.deepEqual(parsed.entity, {
    alternateName: '',
    jobTitle: '',
    worksFor: '',
    alumniOf: [],
    knowsAbout: [],
    email: '',
    telephone: '',
  });
});

test('parseSeed strips control characters from identity fields', () => {
  const parsed = parseSeed({
    profile: seed.profile,
    theme: seed.theme,
    links: [],
    entity: { jobTitle: 'Cloud\nArchitect', worksFor: 'Acme\r\nInc', email: '', telephone: '' },
  });
  assert.equal(parsed.entity.jobTitle, 'Cloud Architect');
  assert.equal(parsed.entity.worksFor, 'Acme Inc');
});

test('validateSeed rejects an invalid contact email or phone', () => {
  assert.throws(() =>
    validateSeed({ ...seed, entity: { ...seed.entity, email: 'not-an-email' } }),
  );
  assert.throws(() =>
    validateSeed({ ...seed, entity: { ...seed.entity, telephone: 'call me maybe' } }),
  );
});
