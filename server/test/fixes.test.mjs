import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { suggestFix } from '../../client/src/lib/fixes.js';

const rulesSrc = fs.readFileSync(new URL('../src/services/scanner/agent/staticRules.js', import.meta.url), 'utf8');
const infraSrc = fs.readFileSync(new URL('../src/services/scanner/agent/infraRules.js', import.meta.url), 'utf8');
const titles = [...new Set([...(rulesSrc + infraSrc).matchAll(/^\s+title: '([^']+)'/gm)].map((m) => m[1]))];

test('every built-in rule has a suggested fix', () => {
  assert.ok(titles.length > 25);
  const missing = titles.filter((t) => !['js', 'py', 'php', 'txt'].some((ext) => suggestFix({ title: t, file: `a.${ext}`, category: 'x' })));
  assert.deepEqual(missing, []);
});

test('picks the example for the file language', () => {
  const sql = { title: 'Possible SQL injection (query built from strings)', category: 'Injection' };
  assert.match(suggestFix({ ...sql, file: 'a.js' }).good, /\$1/);
  assert.match(suggestFix({ ...sql, file: 'a.py' }).good, /%s/);
  assert.match(suggestFix({ ...sql, file: 'a.php' }).good, /prepare/);
});

test('dependency findings become an npm command', () => {
  const f = suggestFix({ source: 'osv', category: 'Vulnerable Dependency', title: 'lodash@4.17.15: Prototype Pollution', recommendation: 'Upgrade lodash to 4.17.21 or later, then re-run your tests.' });
  assert.match(f.good, /npm install lodash@4\.17\.21/);
  assert.equal(suggestFix({ source: 'osv', title: 'x@1: y', recommendation: 'No fixed version.' }), null);
});

test('unknown findings return null and nothing crashes', () => {
  assert.equal(suggestFix({ title: 'Something new the AI found', category: 'Odd' }), null);
  assert.equal(suggestFix(null), null);
});
