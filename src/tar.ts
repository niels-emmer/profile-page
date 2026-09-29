/**
 * Minimal ustar tar reader/writer. Only regular files and directories are
 * supported; symlinks, hardlinks, and device nodes are rejected on read.
 * Kept dependency-free so the runtime dependency count stays at two.
 */

const BLOCK = 512;
const NAME_MAX = 100;

export interface TarEntry {
  name: string;
  data: Buffer;
}

function octal(value: number, length: number): Buffer {
  const digits = value.toString(8).padStart(length - 1, '0');
  return Buffer.from(`${digits}\0`, 'ascii');
}

function header(name: string, size: number, typeflag: '0' | '5'): Buffer {
  if (Buffer.byteLength(name, 'utf8') > NAME_MAX) {
    throw new Error(`tar entry name too long: ${name}`);
  }
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, NAME_MAX, 'utf8');
  block.write('0000644\0', 100, 8, 'ascii'); // mode
  block.write('0000000\0', 108, 8, 'ascii'); // uid
  block.write('0000000\0', 116, 8, 'ascii'); // gid
  octal(size, 12).copy(block, 124);
  octal(Math.floor(Date.now() / 1000), 12).copy(block, 136);
  block.write('        ', 148, 8, 'ascii'); // checksum placeholder
  block.write(typeflag, 156, 1, 'ascii');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');

  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

export function createTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    parts.push(header(entry.name, entry.data.length, '0'));
    parts.push(entry.data);
    const padding = (BLOCK - (entry.data.length % BLOCK)) % BLOCK;
    if (padding > 0) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

function readString(block: Buffer, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
}

function readOctal(block: Buffer, offset: number, length: number): number {
  const text = readString(block, offset, length).trim();
  if (text.length === 0) return 0;
  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid tar size field');
  return value;
}

/** Reject absolute paths, traversal, and backslashes before anything is written. */
function assertSafeName(name: string): void {
  if (name.length === 0) throw new Error('Empty tar entry name');
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error(`Unsafe tar entry name: ${name}`);
  }
}

export function readTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + BLOCK <= buffer.length) {
    const block = buffer.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) break;

    const name = readString(block, 0, NAME_MAX);
    const prefix = readString(block, 345, 155);
    const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
    const size = readOctal(block, 124, 12);
    const typeflag = String.fromCharCode(block[156] ?? 0);
    offset += BLOCK;

    if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
      assertSafeName(fullName);
      if (offset + size > buffer.length) throw new Error('Truncated tar entry');
      entries.push({ name: fullName, data: buffer.subarray(offset, offset + size) });
    } else if (typeflag === '5' || typeflag === 'g' || typeflag === 'x' || typeflag === 'L') {
      // Directory or metadata entry: skip.
    } else {
      throw new Error(`Unsupported tar entry type: ${typeflag}`);
    }

    offset += Math.ceil(size / BLOCK) * BLOCK;
  }

  return entries;
}
