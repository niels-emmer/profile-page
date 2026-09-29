import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTar, readTar } from '../src/tar.ts';

test('tar round-trips files of various sizes', () => {
  const entries = [
    { name: 'seed.json', data: Buffer.from('{"a":1}') },
    { name: 'uploads/a.png', data: Buffer.alloc(1000, 7) },
    { name: 'uploads/empty.bin', data: Buffer.alloc(0) },
    { name: 'uploads/exact.bin', data: Buffer.alloc(512, 3) },
  ];
  const parsed = readTar(createTar(entries));
  assert.deepEqual(
    parsed.map((entry) => entry.name),
    entries.map((entry) => entry.name),
  );
  for (let index = 0; index < entries.length; index += 1) {
    assert.deepEqual(parsed[index]?.data, entries[index]?.data);
  }
});

test('readTar rejects traversal and absolute names', () => {
  assert.throws(() => readTar(createTar([{ name: '../escape.txt', data: Buffer.from('x') }])), /Unsafe/);
  assert.throws(() => readTar(createTar([{ name: '/etc/passwd', data: Buffer.from('x') }])), /Unsafe/);
  assert.throws(() => readTar(createTar([{ name: 'a\\b.txt', data: Buffer.from('x') }])), /Unsafe/);
});

test('readTar rejects truncated data', () => {
  const full = createTar([{ name: 'a.txt', data: Buffer.alloc(600, 1) }]);
  assert.throws(() => readTar(full.subarray(0, 512 + 100)), /Truncated/);
});

test('readTar stops at the end-of-archive marker', () => {
  assert.deepEqual(readTar(Buffer.alloc(1024)), []);
});

test('createTar rejects over-long names', () => {
  assert.throws(() => createTar([{ name: 'x'.repeat(101), data: Buffer.alloc(0) }]), /too long/);
});
