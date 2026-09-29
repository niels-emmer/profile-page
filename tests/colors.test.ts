import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOR_SCHEMES, generateGradient, readableTextColor, shade } from '../src/colors.ts';

test('there are seven colour schemes', () => {
  assert.equal(COLOR_SCHEMES.length, 7);
  for (const scheme of COLOR_SCHEMES) {
    assert.match(scheme.from, /^#[0-9a-f]{6}$/i);
    assert.match(scheme.to, /^#[0-9a-f]{6}$/i);
  }
});

test('readableTextColor picks white on dark and black on light', () => {
  assert.equal(readableTextColor('#000000'), '#ffffff');
  assert.equal(readableTextColor('#ffffff'), '#222222');
  assert.equal(readableTextColor('#0085ff'), '#ffffff');
  assert.equal(readableTextColor('not-a-colour'), '#ffffff');
});

test('shade lightens and darkens', () => {
  assert.equal(shade('#000000', 100), '#ffffff');
  assert.equal(shade('#ffffff', -100), '#000000');
  assert.equal(shade('#808080', 0), '#808080');
  assert.equal(shade('nonsense', 50), 'nonsense');
});

test('generateGradient builds a 45deg gradient', () => {
  assert.equal(generateGradient('#000000', '#ffffff'), 'linear-gradient(45deg, #000000 0%, #ffffff 100%)');
});
