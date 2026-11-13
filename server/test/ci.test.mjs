import test from 'node:test';
import assert from 'node:assert/strict';
import { newApiToken, hashApiToken, looksLikeApiToken } from '../src/services/apiToken.js';
import { cleanProject, shortSha, ciResult } from '../src/services/ci.js';

test('API tokens: random, recognisable, stored only as a hash', () => {
  const a = newApiToken();
  const b = newApiToken();
  assert.notEqual(a.token, b.token);
  assert.ok(looksLikeApiToken(a.token));
  assert.equal(a.hash, hashApiToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.ok(!a.display.includes(a.token.slice(10, 30))); // the display form hides the middle
  for (const bad of ['', 'tm_short', 'abc', null, 'tm_' + 'x'.repeat(100), 'Bearer x']) assert.equal(looksLikeApiToken(bad), false);
});

test('project names and commit ids are cleaned', () => {
  assert.equal(cleanProject('owner/repo'), 'owner/repo');
  assert.equal(cleanProject('  my-org/my.repo_1 '), 'my-org/my.repo_1');
  for (const bad of ['', 'a b', '../../etc', 'x'.repeat(101), '<script>', null]) assert.equal(cleanProject(bad), '');
  assert.equal(shortSha('ABCDEF1234567890'), 'abcdef1');
  assert.equal(shortSha('nothex!'), '');
});

const f = (title, severity, file = 'a.js') => ({ title, severity, file, category: 'x' });
const scan = (findings, riskScore = 10) => ({
  status: 'completed',
  riskScore,
  findings,
  summary: { critical: findings.filter((x) => x.severity === 'critical').length, high: findings.filter((x) => x.severity === 'high').length, medium: 0, low: 0, total: findings.length },
});

test('no baseline: reported as baseline, never counts anything as new', () => {
  const r = ciResult(null, scan([f('SQL injection', 'critical')]));
  assert.equal(r.baseline, true);
  assert.equal(r.newSevere, 0);
  assert.deepEqual(r.newFindings, []);
  assert.equal(r.summary.critical, 1);
});

test('against a baseline: only problems the change added are new', () => {
  const before = scan([f('Old issue', 'high'), f('Minor', 'low')], 30);
  const after = scan([f('Old issue', 'high'), f('New SQL injection', 'critical', 'b.js'), f('New low', 'low', 'c.js')], 55);
  const r = ciResult(before, after);
  assert.equal(r.baseline, false);
  assert.equal(r.newCount, 2);
  assert.equal(r.newSevere, 1);
  assert.equal(r.fixedCount, 1);
  assert.equal(r.scoreChange, 25);
  assert.equal(r.newFindings[0].title, 'New SQL injection');
  assert.deepEqual(Object.keys(r.newFindings[0]).sort(), ['cwe', 'file', 'line', 'severity', 'title']); // no code snippets leave the server
});

test('a long list of new findings is capped', () => {
  const many = Array.from({ length: 50 }, (_, i) => f(`Issue ${i}`, 'medium', `f${i}.js`));
  assert.equal(ciResult(scan([]), scan(many)).newFindings.length, 20);
});
