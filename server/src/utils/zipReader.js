import zlib from 'zlib';

// Minimal, dependency-free zip reader (stored + deflate entries).
// Everything stays in memory: nothing is ever written to disk, so zip-slip paths are harmless,
// and size limits protect against zip bombs.

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(buffer, opts = {}) {
  const {
    maxEntries = 5000,
    maxTotalBytes = 50 * 1024 * 1024,
    maxEntryBytes = 2 * 1024 * 1024,
  } = opts;

  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Not a valid zip archive');

  let eocd = -1;
  const stop = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= stop; i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid zip archive');

  const count = buffer.readUInt16LE(eocd + 10);
  const dirOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff) throw new Error('Zip64 archives are not supported');

  const entries = [];
  const skipped = [];
  let total = 0;
  let pos = dirOffset;

  for (let n = 0; n < count; n++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CENTRAL) throw new Error('Corrupt zip directory');

    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const compSize = buffer.readUInt32LE(pos + 20);
    const size = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory entry
    if (entries.length >= maxEntries) {
      // Scan through: keep what was extracted so far instead of rejecting the whole archive.
      skipped.push({ name: '(remaining files)', reason: `archive file limit reached (max ${maxEntries})` });
      break;
    }
    if (flags & 1) {
      skipped.push({ name, reason: 'encrypted' });
      continue;
    }
    if (size > maxEntryBytes) {
      skipped.push({ name, reason: 'too large' });
      continue;
    }
    if (method !== 0 && method !== 8) {
      skipped.push({ name, reason: 'unsupported compression' });
      continue;
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) {
      throw new Error('Corrupt zip entry');
    }

    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compSize);

    let data;
    try {
      // maxOutputLength stops a tiny archive from inflating into gigabytes
      data = method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: maxEntryBytes + 1 });
    } catch {
      skipped.push({ name, reason: 'corrupt or too large' });
      continue;
    }
    if (data.length > maxEntryBytes) {
      skipped.push({ name, reason: 'too large' });
      continue;
    }

    total += data.length;
    if (total > maxTotalBytes) {
      // Scan through: keep what was extracted so far instead of rejecting the whole archive.
      skipped.push({ name, reason: 'archive too large once extracted, remaining files skipped' });
      break;
    }
    entries.push({ path: name, buffer: data });
  }

  return { entries, skipped };
}
