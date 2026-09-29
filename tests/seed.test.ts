import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { getProfile, getTheme, listLinks, openDatabase } from '../src/db.ts';
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
    validateSeed({ ...seed, profile: { ...seed.profile, avatarPath: 'https://evil.example/a.jpg' } }),
  );
  assert.throws(() => validateSeed({ ...seed, links: [{ ...second, iconValue: 'https://evil.example/i.png' }] }));
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

    const links = listLinks(db);
    assert.equal(links.length, 2);
    assert.equal(links[0]?.text, 'One');
    assert.equal(links[1]?.borderColor, '#ffffff');

    // Re-applying replaces rather than appends.
    applySeed(db, { ...seed, links: [seed.links[0]!] });
    assert.equal(listLinks(db).length, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
