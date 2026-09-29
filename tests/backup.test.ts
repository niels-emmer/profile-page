import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { BackupError, buildBackup, restoreBackup } from '../src/backup.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createLink, getProfile, getTheme, listLinks, openDatabase, saveProfile, saveTheme } from '../src/db.ts';
import { DEFAULT_THEME } from '../src/defaults.ts';
import { createTar, readTar } from '../src/tar.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { NewLink, SeedFile } from '../src/types.ts';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001a5f645400000000049454e44ae426082',
  'hex',
);

const LINK: NewLink = {
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
};

const SEED: SeedFile = {
  profile: { name: 'Restored', tagline: 'T', description: 'D', avatarPath: '/assets/uploads/avatar.png' },
  theme: { ...DEFAULT_THEME, accentColor: '#123456' },
  links: [LINK],
};

interface Fixture {
  dir: string;
  config: Config;
  db: DatabaseSync;
}

function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'pp-backup-'));
  const config = loadConfig({ DATA_DIR: dir, ADMIN_PASSWORD: 'x' });
  return { dir, config, db: openDatabase(config) };
}

function dispose(fixture: Fixture): void {
  fixture.db.close();
  rmSync(fixture.dir, { recursive: true, force: true });
}

test('buildBackup writes a seed and every upload', () => {
  const fixture = makeFixture();
  try {
    saveProfile(fixture.db, SEED.profile);
    saveTheme(fixture.db, SEED.theme);
    createLink(fixture.db, LINK);
    writeFileSync(join(fixture.config.uploadsDir, 'avatar.png'), PNG);

    const entries = readTar(gunzipSync(buildBackup(fixture.db, fixture.config.uploadsDir)));
    assert.deepEqual(
      entries.map((entry) => entry.name).sort(),
      ['seed.json', 'uploads/avatar.png'],
    );

    const seed = JSON.parse(entries.find((entry) => entry.name === 'seed.json')!.data.toString()) as SeedFile;
    assert.equal(seed.profile.name, 'Restored');
    assert.equal(seed.links.length, 1);
    assert.equal((seed.links[0] as unknown as { id?: number }).id, undefined);
  } finally {
    dispose(fixture);
  }
});

test('restoreBackup replaces content and images', () => {
  const source = makeFixture();
  const target = makeFixture();
  try {
    saveProfile(source.db, SEED.profile);
    saveTheme(source.db, SEED.theme);
    createLink(source.db, LINK);
    writeFileSync(join(source.config.uploadsDir, 'avatar.png'), PNG);
    const archive = buildBackup(source.db, source.config.uploadsDir);

    saveProfile(target.db, { name: 'Old', tagline: '', description: '', avatarPath: null });
    writeFileSync(join(target.config.uploadsDir, 'stale.png'), PNG);

    restoreBackup(target.db, target.config.uploadsDir, archive);

    assert.equal(getProfile(target.db).name, 'Restored');
    assert.equal(getTheme(target.db).accentColor, '#123456');
    assert.equal(listLinks(target.db).length, 1);
    assert.deepEqual(readdirSync(target.config.uploadsDir), ['avatar.png']);
  } finally {
    dispose(source);
    dispose(target);
  }
});

test('backup round-trips per-theme background settings', () => {
  const source = makeFixture();
  const target = makeFixture();
  try {
    saveTheme(source.db, {
      ...DEFAULT_THEME,
      backgroundImageDark: {
        imagePath: '/assets/uploads/bg.webp',
        size: 'contain',
        position: 'bottom right',
        repeat: 'repeat',
        attachment: 'fixed',
        color: '#112233',
        opacity: 45,
      },
    });
    const archive = buildBackup(source.db, source.config.uploadsDir);
    restoreBackup(target.db, target.config.uploadsDir, archive);

    const bg = getTheme(target.db).backgroundImageDark;
    assert.equal(bg.imagePath, '/assets/uploads/bg.webp');
    assert.equal(bg.size, 'contain');
    assert.equal(bg.position, 'bottom right');
    assert.equal(bg.repeat, 'repeat');
    assert.equal(bg.attachment, 'fixed');
    assert.equal(bg.color, '#112233');
    assert.equal(bg.opacity, 45);
  } finally {
    dispose(source);
    dispose(target);
  }
});

test('restoreBackup rejects invalid archives without writing', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => restoreBackup(fixture.db, fixture.config.uploadsDir, Buffer.alloc(0)), BackupError);
    assert.throws(() => restoreBackup(fixture.db, fixture.config.uploadsDir, Buffer.from('not gzip')), BackupError);

    const noSeed = gzipSync(createTar([{ name: 'uploads/a.png', data: PNG }]));
    assert.throws(() => restoreBackup(fixture.db, fixture.config.uploadsDir, noSeed), /missing seed\.json/);

    const badSeed = gzipSync(
      createTar([
        {
          name: 'seed.json',
          data: Buffer.from('{"profile":{},"theme":{},"links":[{"url":"javascript:alert(1)"}]}'),
        },
      ]),
    );
    assert.throws(() => restoreBackup(fixture.db, fixture.config.uploadsDir, badSeed), BackupError);

    const badFile = gzipSync(
      createTar([
        { name: 'seed.json', data: Buffer.from(JSON.stringify(SEED)) },
        { name: 'uploads/evil.exe', data: Buffer.from('MZ not an image') },
      ]),
    );
    assert.throws(() => restoreBackup(fixture.db, fixture.config.uploadsDir, badFile), /Unsupported file/);

    assert.equal(getProfile(fixture.db).name, 'Alex Rivera');
    assert.deepEqual(readdirSync(fixture.config.uploadsDir), []);
  } finally {
    dispose(fixture);
  }
});

test('restoreBackup strips active content from SVG uploads', () => {
  const fixture = makeFixture();
  try {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="x()" width="1"/></svg>';
    const archive = gzipSync(
      createTar([
        { name: 'seed.json', data: Buffer.from(JSON.stringify(SEED)) },
        { name: 'uploads/icon.svg', data: Buffer.from(svg) },
      ]),
    );
    restoreBackup(fixture.db, fixture.config.uploadsDir, archive);
    const written = readFileSync(join(fixture.config.uploadsDir, 'icon.svg'), 'utf8');
    assert.ok(!written.includes('<script'));
    assert.ok(!written.includes('onload'));
  } finally {
    dispose(fixture);
  }
});

test('restoreBackup accepts a root-level json seed and ignores AppleDouble entries', () => {
  const fixture = makeFixture();
  try {
    const archive = gzipSync(
      createTar([
        { name: '._my-seed.json', data: Buffer.from('junk') },
        { name: 'my-seed.json', data: Buffer.from(JSON.stringify(SEED)) },
        { name: 'uploads/._avatar.png', data: Buffer.from('junk') },
        { name: 'uploads/avatar.png', data: PNG },
      ]),
    );
    restoreBackup(fixture.db, fixture.config.uploadsDir, archive);
    assert.equal(getProfile(fixture.db).name, 'Restored');
    assert.deepEqual(readdirSync(fixture.config.uploadsDir), ['avatar.png']);
  } finally {
    dispose(fixture);
  }
});
