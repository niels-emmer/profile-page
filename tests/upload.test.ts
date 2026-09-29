import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MAX_UPLOAD_BYTES,
  UploadError,
  deleteUpload,
  detectImageType,
  saveImage,
} from '../src/upload.ts';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001a5f645400000000049454e44ae426082',
  'hex',
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.from('524946460000000057454250', 'hex');

test('detectImageType identifies supported formats from magic bytes', () => {
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(JPEG), 'jpg');
  assert.equal(detectImageType(WEBP), 'webp');
  assert.equal(detectImageType(Buffer.from('not an image')), undefined);
  assert.equal(detectImageType(Buffer.from('')), undefined);
});

test('saveImage writes a random filename and returns a public path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-upload-'));
  try {
    const first = saveImage(PNG, dir);
    const second = saveImage(PNG, dir);
    assert.match(first.filename, /^[0-9a-f]{32}\.png$/);
    assert.notEqual(first.filename, second.filename);
    assert.equal(first.path, `/assets/uploads/${first.filename}`);
    assert.equal(readdirSync(dir).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveImage rejects empty, oversized, and non-image payloads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-upload-'));
  try {
    assert.throws(() => saveImage(new Uint8Array(0), dir), UploadError);
    assert.throws(() => saveImage(new Uint8Array(MAX_UPLOAD_BYTES + 1), dir), UploadError);
    assert.throws(() => saveImage(Buffer.from('definitely not an image'), dir), UploadError);
    assert.equal(readdirSync(dir).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveImage honours a custom size cap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-upload-'));
  try {
    assert.throws(() => saveImage(PNG, dir, 4), UploadError);
    assert.equal(readdirSync(dir).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deleteUpload removes only files under /assets/uploads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-upload-'));
  try {
    const saved = saveImage(PNG, dir);
    deleteUpload(dir, saved.path);
    assert.equal(existsSync(join(dir, saved.filename)), false);

    // Bundled assets, traversal, and null are ignored.
    deleteUpload(dir, '/assets/favicon.png');
    deleteUpload(dir, '/assets/uploads/../secret');
    deleteUpload(dir, '/assets/uploads/');
    deleteUpload(dir, null);
    assert.equal(readdirSync(dir).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
