import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoFiles } from '../src/services/demoProject.js';
import { loadSources } from '../src/services/scanner/agent/fileLoader.js';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';

test('the demo project produces a rich report from the real rules', async () => {
  const files = demoFiles().map((f) => ({ originalName: f.name, key: f.name, storage: 'local' }));
  const byKey = Object.fromEntries(demoFiles().map((f) => [f.name, Buffer.from(f.content)]));
  const { sources } = await loadSources({ files, readFile: async (k) => byKey[k] });
  const findings = runStaticRules(sources);
  const titles = findings.map((f) => f.title).join(' | ');

  assert.ok(findings.length >= 8, `only ${findings.length} findings: ${titles}`);
  assert.ok(findings.some((f) => f.severity === 'critical'));
  for (const expected of [/SQL injection/, /eval/, /Weak hash/, /CORS/, /Stack trace/, /Open redirect/, /AWS access key/]) {
    assert.match(titles, expected);
  }
});

test('the source file itself holds no secret-looking text (GitHub would block the push)', () => {
  const src = fs.readFileSync(new URL('../src/services/demoProject.js', import.meta.url), 'utf8');
  assert.equal(/AKIA[0-9A-Z]{16}/.test(src), false);
  assert.equal(/sk_live_|ghp_|-----BEGIN/.test(src), false);
});
