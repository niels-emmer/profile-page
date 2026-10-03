import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qrMatrix, qrPathData } from '../src/qr.ts';

// Reference matrices generated with Project Nayuki's qrcodegen (MIT) in byte
// mode at error-correction level M, with automatic version selection and ECL
// boosting disabled. These pin the exact module output, including the
// Reed-Solomon codewords, placement, and automatic mask choice.
const VECTORS: Array<{ text: string; rows: string[] }> = [
  {
    text: 'https://nielsemmer.com/',
    rows: [
      '1111111011000100001111111',
      '1000001011010010101000001',
      '1011101010000101001011101',
      '1011101001111110101011101',
      '1011101010010110101011101',
      '1000001001111110001000001',
      '1111111010101010101111111',
      '0000000001010110100000000',
      '1001111110010010110010111',
      '0110110011001011000111110',
      '0010111100100111110001001',
      '1001110001111010001111111',
      '0001101001101000101100001',
      '1011000110000011100010010',
      '1100111000011011011011111',
      '1001110011110000011101101',
      '1001011110000101111110110',
      '0000000010011100100010110',
      '1111111010110100101010001',
      '1000001011101101100010010',
      '1011101010001001111110011',
      '1011101011000111011000011',
      '1011101000001101010011111',
      '1000001001100011000110111',
      '1111111010001110111001001',
    ],
  },
  {
    text: 'https://github.com/niels-emmer/profile-page',
    rows: [
      '111111100000001010111101001111111',
      '100000100000000110101100001000001',
      '101110101100101110000110001011101',
      '101110101110000100110100101011101',
      '101110101010001110001110001011101',
      '100000101001110000010001101000001',
      '111111101010101010101010101111111',
      '000000001000100010011101000000000',
      '101111100011010001010001001111100',
      '100001011001110011111001001101101',
      '011011110101011111000010111010110',
      '101101011011010111111000110011101',
      '110010100111101010011111110111000',
      '111010000010000101100000111101011',
      '111011100000101110001010011001010',
      '000001001100000100100100011001100',
      '101110101010001101000010110110001',
      '001010011110011010011101001101111',
      '010001101110111110101100100110110',
      '100110010111011110011110000111100',
      '001001101010110000110100110111000',
      '110011010010000110001111001001101',
      '101001100111011001110000010100010',
      '100111000110111010011111011011111',
      '100100110010100001110010111110001',
      '000000001110010011110001100010111',
      '111111100100011111001011101010110',
      '100000101110011111101001100011111',
      '101110101100000110011110111111011',
      '101110101110000101100001110010001',
      '101110101010101110001010001101100',
      '100000100111110100000110000011100',
      '111111101110100101000011110100010',
    ],
  },
  {
    text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    rows: [
      '111111101010000001001111001010101100101111111',
      '100000100011110010010101001000100101001000001',
      '101110101001000100111010111101110101001011101',
      '101110100111000101001010010101010101101011101',
      '101110100011001101001111111010101011101011101',
      '100000101101111111101000110000100000001000001',
      '111111101010101010101010101010101010101111111',
      '000000000000101100111000100010001000000000000',
      '101000110000101010011111101010101011000100101',
      '110010011100010010000001010101010101010100001',
      '001100100110000001101011110111011100110110101',
      '001100011100001101000101000000001000000011010',
      '111101101000001100101101101000101011001011011',
      '111001011000110110100110110011010101010100001',
      '100110100001101001110100110001011100110110101',
      '110000001100001101010111000010001000000011010',
      '010010101100000100101111101010101011001011011',
      '010000001100100000100000110101010101010100001',
      '000110111001111011110010110111011100110110101',
      '001001001100000011010101011010001000000011010',
      '100111111101001100101111110010101011111111011',
      '001010001101101010101000111101010101100010001',
      '110010101000110011111010111111011100101010101',
      '111010001111011001001000100010001000100011010',
      '010111111000100101111111101010101010111111011',
      '111000000111001011011010010101010100010100001',
      '110001111100110010110111010111011101101010101',
      '111001010000111001000101000000001001101001001',
      '011010101101100100011010101110101011011101000',
      '110000011010101000001010010101010100010100001',
      '100101110000100101101111110111011101101010101',
      '111101011011001110111101100010001001101001010',
      '011000101001101100001011001010101011011101011',
      '101001011010100111111011110101010100010100001',
      '000010110000101011110111010111011101101010101',
      '011110011011001100100101000010001001101001010',
      '100110110000110110011111101010101011111111011',
      '000000001010101111101000100101010101100010001',
      '111111101011010111101010101111011101101010101',
      '100000100010000100011000100010001000100011010',
      '101110100100110110111111101010101011111111011',
      '101110100101110111110001010101010100100010001',
      '101110101011010110111011110111011100101010101',
      '100000100111000100001000100010001001010101000',
      '111111101100110001101010101010101011110111001',
    ],
  },
];

function rowsOf(matrix: boolean[][]): string[] {
  return matrix.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));
}

function formatBits(matrix: boolean[][]): number {
  const positions: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i++) positions.push([8, i]);
  positions.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) positions.push([14 - i, 8]);
  let bits = 0;
  positions.forEach(([x, y], i) => {
    if (matrix[y]![x]) bits |= 1 << i;
  });
  return bits;
}

test('qrMatrix reproduces the reference encoder byte for byte', () => {
  for (const vector of VECTORS) {
    assert.deepEqual(rowsOf(qrMatrix(vector.text)), vector.rows, vector.text);
  }
});

test('qrMatrix picks the smallest version that fits', () => {
  assert.equal(qrMatrix('https://a.co/').length, 21); // version 1
  assert.equal(qrMatrix('https://nielsemmer.com/').length, 25); // version 2
});

test('qrMatrix draws the three finder patterns', () => {
  const matrix = qrMatrix('https://example.com/');
  const size = matrix.length;
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as Array<[number, number]>) {
    assert.equal(matrix[cy - 3]![cx - 3], true, 'outer corner');
    assert.equal(matrix[cy - 2]![cx - 2], false, 'inner light ring');
    assert.equal(matrix[cy - 1]![cx - 1], true, 'inner dark ring');
    assert.equal(matrix[cy]![cx], true, 'centre');
  }
});

test('qrMatrix draws the timing patterns between the finders', () => {
  const matrix = qrMatrix('https://example.com/');
  const size = matrix.length;
  for (let i = 8; i <= size - 9; i++) {
    assert.equal(matrix[6]![i], i % 2 === 0, `row 6 at x=${i}`);
    assert.equal(matrix[i]![6], i % 2 === 0, `column 6 at y=${i}`);
  }
});

test('qrMatrix sets the fixed dark module', () => {
  const matrix = qrMatrix('https://example.com/');
  assert.equal(matrix[matrix.length - 8]![8], true);
});

test('qrMatrix writes a valid level-M format codeword', () => {
  const matrix = qrMatrix('https://example.com/');
  const bits = formatBits(matrix);
  const data = (bits ^ 0x5412) >>> 10;
  assert.equal(data >> 3, 0, 'error-correction level M');
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  assert.equal((data << 10) | rem, bits ^ 0x5412, 'BCH check bits');
});

test('qrMatrix encodes UTF-8 bytes rather than code points', () => {
  // "é" is one code point but two UTF-8 bytes, so ten of them occupy the same
  // space as twenty ASCII characters.
  assert.equal(qrMatrix('é'.repeat(10)).length, qrMatrix('x'.repeat(20)).length);
});

test('qrMatrix rejects a payload that fits no version', () => {
  assert.throws(() => qrMatrix('a'.repeat(3000)), RangeError);
});

test('qrPathData emits one subpath per dark module, offset by the quiet zone', () => {
  const matrix = [
    [true, false],
    [false, true],
  ];
  assert.equal(qrPathData(matrix, 4), 'M4 4h1v1h-1zM5 5h1v1h-1z');
});

test('qrPathData emits nothing for an empty symbol', () => {
  assert.equal(qrPathData([], 4), '');
});

// A payload sweep generated from Project Nayuki's qrcodegen (MIT): the version
// it selects and an FNV-1a 32-bit hash of its module rows. This pins the whole
// version range (1–40), including the 16-bit character-count field (v10+), the
// version information blocks (v7+), and the version-32 alignment special case.
const VERSION_SWEEP: Array<{ length: number; version: number; hash: number }> = [
  { length: 1, version: 1, hash: 2869514145 },
  { length: 8, version: 1, hash: 828117715 },
  { length: 16, version: 2, hash: 1186886507 },
  { length: 25, version: 2, hash: 1287027177 },
  { length: 33, version: 3, hash: 2418772737 },
  { length: 42, version: 3, hash: 1815420277 },
  { length: 60, version: 4, hash: 936640232 },
  { length: 80, version: 5, hash: 2610475259 },
  { length: 100, version: 6, hash: 3212777309 },
  { length: 122, version: 7, hash: 1519909996 },
  { length: 150, version: 8, hash: 4068875568 },
  { length: 180, version: 9, hash: 3835343812 },
  { length: 200, version: 10, hash: 1008936930 },
  { length: 213, version: 10, hash: 2520136422 },
  { length: 260, version: 12, hash: 3356675636 },
  { length: 320, version: 13, hash: 404513922 },
  { length: 400, version: 15, hash: 3967816302 },
  { length: 480, version: 17, hash: 1469342616 },
  { length: 560, version: 18, hash: 1146925702 },
  { length: 700, version: 21, hash: 2324584384 },
  { length: 850, version: 23, hash: 2996907663 },
  { length: 1000, version: 26, hash: 2898006552 },
  { length: 1200, version: 29, hash: 627748211 },
  { length: 1400, version: 31, hash: 442026480 },
  { length: 1500, version: 32, hash: 1665974004 },
  { length: 1550, version: 33, hash: 124088904 },
  { length: 1700, version: 34, hash: 1522012987 },
  { length: 2000, version: 38, hash: 3194765512 },
  { length: 2300, version: 40, hash: 2785235592 },
];

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

test('qrMatrix matches the reference across versions 1–40', () => {
  for (const { length, version, hash } of VERSION_SWEEP) {
    const matrix = qrMatrix('a'.repeat(length));
    assert.equal((matrix.length - 17) / 4, version, `version for a ${length}-byte payload`);
    assert.equal(fnv1a32(rowsOf(matrix).join('')), hash, `modules for a ${length}-byte payload`);
  }
});
