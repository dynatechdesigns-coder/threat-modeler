import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUnicodeHost } from '../src/services/links/heuristics.js';
import { analyzeText, summarize } from '../src/services/links/analyze.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..', 'src', 'services', 'links');
const clientDir = path.join(here, '..', '..', 'client', 'src', 'lib', 'links');

test('the offline (browser) copy of the link checks matches the server copy exactly', { skip: !fs.existsSync(clientDir) && 'client folder not present' }, () => {
  for (const file of ['extract.js', 'heuristics.js', 'spamText.js', 'analyze.js']) {
    const a = fs.readFileSync(path.join(serverDir, file), 'utf8').replace(/\r\n/g, '\n');
    const b = fs.readFileSync(path.join(clientDir, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(b, a, `client/src/lib/links/${file} differs from the server copy. Copy the server file over it.`);
  }
});

test('shared files use no Node-only imports, so they run in a browser', () => {
  for (const file of ['extract.js', 'heuristics.js', 'spamText.js', 'analyze.js']) {
    const src = fs.readFileSync(path.join(serverDir, file), 'utf8');
    assert.ok(!/from 'node:/.test(src) && !/require\(/.test(src), `${file} imports a Node-only module`);
  }
});

test('punycode: look-alike domains are shown as the characters people see', () => {
  const shown = toUnicodeHost('xn--pypal-4ve.com');
  assert.ok(shown.endsWith('.com'));
  assert.ok([...shown].some((c) => c.codePointAt(0) > 127), 'should contain a non-ASCII letter');
  assert.equal(toUnicodeHost('example.com'), 'example.com');
  assert.equal(toUnicodeHost('xn--zzz-invalid-@@'), 'xn--zzz-invalid-@@');
});

test('offline analysis gives the same answer shape as the API', () => {
  const out = summarize(analyzeText('Verify at http://secure-paypal-login.xyz/verify now! Send your OTP.'));
  assert.equal(out.overall, 'dangerous');
  assert.equal(out.summary.dangerous, 1);
  assert.ok(out.urls.every((u) => !('href' in u)));
  assert.ok(out.message.reasons.length > 0);
});
