import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/utils/zipReader.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const zipBuf = fs.readFileSync(path.join(dir, 'fixtures', 'vulnerable-app.zip'));

// Oversized uploads must scan through, not reject: the extractor keeps what
// fits and reports the rest as skipped, so a big project still gets findings
// instead of a failed scan.
test('oversized archives degrade gracefully instead of throwing', () => {
  const full = readZip(zipBuf);
  const total = full.entries.reduce((n, e) => n + e.buffer.length, 0);
  assert.ok(total > 100 && full.entries.length > 1, 'test needs a multi-file fixture');
  const tiny = readZip(zipBuf, { maxTotalBytes: Math.floor(total / 2) });
  assert.ok(tiny.entries.length > 0, 'keeps the entries extracted before the cap');
  assert.ok(tiny.skipped.length > 0, 'reports the remaining files as skipped');
  assert.ok(!tiny.entries.some((e) => e.buffer.length === 0), 'kept entries are intact');
});

test('archives with too many files degrade gracefully instead of throwing', () => {
  const full = readZip(zipBuf);
  assert.ok(full.entries.length > 1, 'test needs a multi-file fixture');
  const capped = readZip(zipBuf, { maxEntries: 1 });
  assert.equal(capped.entries.length, 1, 'keeps entries up to the cap');
  assert.ok(capped.skipped.length > 0, 'reports the remaining files as skipped');
  assert.doesNotThrow(() => readZip(zipBuf, { maxEntries: 1, maxTotalBytes: 10 }));
});

test('corrupt archives still fail loudly', () => {
  assert.throws(() => readZip(Buffer.from('this is definitely not a zip archive at all')), /valid zip/);
});
