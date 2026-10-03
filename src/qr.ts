/**
 * Dependency-free QR Code encoder.
 *
 * Implements the QR Code model-2 symbology from ISO/IEC 18004 in byte mode with
 * error-correction level M: GF(256) Reed-Solomon error correction, automatic
 * version selection, and the eight data-mask patterns scored with the standard
 * penalty rules. It produces a boolean module matrix; turning that into markup
 * is `render.ts`'s job, so no HTML escaping happens here.
 *
 * No third-party code and no runtime dependency (see invariants.md #1) — this is
 * the same approach as the hand-written `src/tar.ts`.
 */

/** Error-correction level M as it appears in the 2-bit format information. */
const EC_LEVEL_M = 0b00;

/** Number of blank modules required around the symbol (ISO/IEC 18004 §6.3.4). */
export const QR_QUIET_ZONE = 4;

/* ------------------------------- GF(256) ------------------------------- */

// Exponentiation/log tables for GF(256) with primitive polynomial 0x11D.
const GF_EXP = new Uint8Array(255);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ ((x & 0x80) !== 0 ? 0x11d : 0);
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a]! + GF_LOG[b]!) % 255]!;
}

/** The generator polynomial for a Reed-Solomon block with `degree` EC codewords. */
function rsDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Polynomial remainder of `data` divided by `divisor` (the EC codewords). */
function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0]!;
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) {
      result[i] = result[i]! ^ gfMul(divisor[i]!, factor);
    }
  }
  return result;
}

/* ----------------------------- ECC tables ------------------------------ */

// ISO/IEC 18004 Table 9, level M, indexed by version (index 0 is unused).

/** EC codewords per block. */
const ECC_PER_BLOCK_M = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28,
];

/** Number of error-correction blocks. */
const NUM_BLOCKS_M = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18,
  20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/* --------------------------- symbol capacity --------------------------- */

/** Total number of data modules (function patterns excluded) for a version. */
function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Number of usable data codewords (bytes) for a version at level M. */
function dataCodewords(ver: number): number {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * NUM_BLOCKS_M[ver]!;
}

/** Bits used by the byte-mode character count field. */
function charCountBits(ver: number): number {
  return ver <= 9 ? 8 : 16;
}

/** Smallest version whose data capacity fits `byteLen` payload bytes. */
function chooseVersion(byteLen: number): number {
  for (let ver = 1; ver <= 40; ver++) {
    const capacity = dataCodewords(ver) * 8;
    const needed = 4 + charCountBits(ver) + byteLen * 8;
    if (needed <= capacity) return ver;
  }
  throw new RangeError('QR payload is too long to encode');
}

/* ---------------------------- data encoding ---------------------------- */

function encodeData(bytes: Uint8Array, ver: number): number[] {
  const capacityBits = dataCodewords(ver) * 8;
  const bits: number[] = [];
  const push = (value: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // byte mode indicator
  push(bytes.length, charCountBits(ver));
  for (const b of bytes) push(b, 8);

  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0); // pad to a codeword boundary
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j]!;
    codewords.push(value);
  }
  return codewords;
}

/** Split data into blocks, append Reed-Solomon codewords, and interleave. */
function addEcc(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS_M[ver]!;
  const blockEccLen = ECC_PER_BLOCK_M[ver]!;
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);

  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(offset, offset + dataLen);
    offset += dataLen;
    const ecc = rsRemainder(Uint8Array.from(dat), divisor);
    const block = dat.slice();
    if (i < numShortBlocks) block.push(0); // dummy byte to align the interleave
    for (const e of ecc) block.push(e);
    blocks.push(block);
  }

  const result: number[] = [];
  const blockLen = blocks[0]!.length;
  for (let i = 0; i < blockLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      // Short blocks carry a dummy byte at the data/ECC boundary; skip it.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result.push(blocks[j]![i]!);
      }
    }
  }
  return result;
}

/* --------------------------- matrix building --------------------------- */

interface Matrix {
  size: number;
  modules: boolean[][];
  isFunction: boolean[][];
}

function createMatrix(size: number): Matrix {
  const modules: boolean[][] = [];
  const isFunction: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    modules.push(new Array<boolean>(size).fill(false));
    isFunction.push(new Array<boolean>(size).fill(false));
  }
  return { size, modules, isFunction };
}

function setFunction(m: Matrix, x: number, y: number, dark: boolean): void {
  m.modules[y]![x] = dark;
  m.isFunction[y]![x] = true;
}

function drawFinderPattern(m: Matrix, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < m.size && y >= 0 && y < m.size) {
        setFunction(m, x, y, dist !== 2 && dist !== 4);
      }
    }
  }
}

function drawAlignmentPattern(m: Matrix, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(m, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** Row/column coordinates of the alignment patterns for a version. */
function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function drawFormatBits(m: Matrix, mask: number): void {
  const data = (EC_LEVEL_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
  const size = m.size;

  for (let i = 0; i <= 5; i++) setFunction(m, 8, i, bit(i));
  setFunction(m, 8, 7, bit(6));
  setFunction(m, 8, 8, bit(7));
  setFunction(m, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(m, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) setFunction(m, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(m, 8, size - 15 + i, bit(i));
  setFunction(m, 8, size - 8, true); // the fixed dark module
}

function drawVersion(m: Matrix, ver: number): void {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = m.size - 11 + (i % 3);
    const row = Math.floor(i / 3);
    setFunction(m, a, row, dark);
    setFunction(m, row, a, dark);
  }
}

function drawFunctionPatterns(m: Matrix, ver: number): void {
  const size = m.size;

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    setFunction(m, 6, i, i % 2 === 0);
    setFunction(m, i, 6, i % 2 === 0);
  }

  // Finder patterns and their separators.
  drawFinderPattern(m, 3, 3);
  drawFinderPattern(m, size - 4, 3);
  drawFinderPattern(m, 3, size - 4);

  // Alignment patterns, skipping the three that would overlap a finder.
  const positions = alignmentPositions(ver);
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      drawAlignmentPattern(m, positions[i]!, positions[j]!);
    }
  }

  // Reserve the format-information area (real values are written per mask).
  drawFormatBits(m, 0);
  if (ver >= 7) drawVersion(m, ver);
}

function drawCodewords(m: Matrix, codewords: number[]): void {
  let i = 0;
  for (let right = m.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < m.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? m.size - 1 - vert : vert;
        if (!m.isFunction[y]![x] && i < codewords.length * 8) {
          m.modules[y]![x] = ((codewords[i >> 3]! >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(m: Matrix, mask: number): void {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.isFunction[y]![x] && maskBit(mask, x, y)) {
        m.modules[y]![x] = !m.modules[y]![x];
      }
    }
  }
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// Rule 3 tracks the recent run lengths on a line so it can count the
// 1:1:3:1:1 finder-like pattern (dark/light/dark/light/dark) preceded or
// followed by a light area four units wide, generalised to any unit size.

/** Pushes a run length onto the front of the history, dropping the last entry. */
function finderPenaltyAddHistory(runLength: number, history: number[], size: number): void {
  if (history[0] === 0) runLength += size; // count the light border before the first run
  history.pop();
  history.unshift(runLength);
}

/** Counts finder-like patterns in the current run history (0, 1, or 2). */
function finderPenaltyCountPatterns(history: number[]): number {
  const n = history[1]!;
  const core =
    n > 0 &&
    history[2] === n &&
    history[3] === n * 3 &&
    history[4] === n &&
    history[5] === n;
  return (
    (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) +
    (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0)
  );
}

/** Terminates a line and counts the trailing finder-like patterns. */
function finderPenaltyTerminateAndCount(
  currentRunColor: boolean,
  currentRunLength: number,
  history: number[],
  size: number,
): number {
  let length = currentRunLength;
  if (currentRunColor) {
    finderPenaltyAddHistory(length, history, size);
    length = 0;
  }
  length += size; // count the light border after the final run
  finderPenaltyAddHistory(length, history, size);
  return finderPenaltyCountPatterns(history);
}

function getPenalty(m: Matrix): number {
  const size = m.size;
  let result = 0;

  // Rules 1 and 3: same-coloured runs, and finder-like patterns.
  for (let y = 0; y < size; y++) {
    let color = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      const next = m.modules[y]![x]!;
      if (next === color) {
        run++;
        if (run === 5) result += PENALTY_N1;
        else if (run > 5) result++;
      } else {
        finderPenaltyAddHistory(run, history, size);
        if (!color) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        color = next;
        run = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(color, run, history, size) * PENALTY_N3;
  }
  for (let x = 0; x < size; x++) {
    let color = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      const next = m.modules[y]![x]!;
      if (next === color) {
        run++;
        if (run === 5) result += PENALTY_N1;
        else if (run > 5) result++;
      } else {
        finderPenaltyAddHistory(run, history, size);
        if (!color) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        color = next;
        run = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(color, run, history, size) * PENALTY_N3;
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = m.modules[y]![x]!;
      if (
        color === m.modules[y]![x + 1] &&
        color === m.modules[y + 1]![x] &&
        color === m.modules[y + 1]![x + 1]
      ) {
        result += PENALTY_N2;
      }
    }
  }

  // Rule 4: balance between dark and light modules.
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (m.modules[y]![x]) dark++;
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

/* --------------------------------- API --------------------------------- */

/**
 * Encode `text` (UTF-8, byte mode, level M) into a square module matrix.
 * `matrix[y][x] === true` means a dark module. Throws when the payload does
 * not fit any version.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const ver = chooseVersion(bytes.length);
  const codewords = addEcc(encodeData(bytes, ver), ver);
  const size = ver * 4 + 17;
  const m = createMatrix(size);
  drawFunctionPatterns(m, ver);
  drawCodewords(m, codewords);

  let bestMask = 0;
  let minPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormatBits(m, mask);
    const penalty = getPenalty(m);
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
    applyMask(m, mask); // undo before trying the next mask
  }
  applyMask(m, bestMask);
  drawFormatBits(m, bestMask);
  return m.modules;
}

/**
 * An SVG path (`d` attribute) drawing every dark module as a 1x1 square, offset
 * by `quiet` blank modules. Coordinates are integers, so the result is safe to
 * interpolate into markup unescaped.
 */
export function qrPathData(matrix: boolean[][], quiet: number): string {
  const size = matrix.length;
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    const row = matrix[y]!;
    for (let x = 0; x < size; x++) {
      if (row[x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return parts.join('');
}
