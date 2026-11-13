import test from 'node:test';
import assert from 'node:assert/strict';
import { newShareToken, isShareToken, publicReport } from '../src/services/share.js';

test('tokens are long, unique and URL safe', () => {
  const a = newShareToken();
  assert.ok(isShareToken(a));
  assert.notEqual(a, newShareToken());
  assert.equal(a.length, 32);
  for (const bad of ['', 'short', 'a/b'.repeat(10), null, undefined, '../../etc/passwd', 'x'.repeat(65)]) assert.equal(isShareToken(bad), false);
});

test('public report exposes only the allow-listed fields', () => {
  const report = {
    _id: 'R1', user: 'U1', name: 'shop', shareToken: 'SECRETTOKEN', logs: ['[INFO] /srv/tmp/path'], error: 'boom',
    files: [{ originalName: 'a.zip', key: 'U1/123-a.zip', storage: 'r2' }], riskScore: 60, completedAt: 'd',
    summary: { total: 1 }, aiSummary: { text: 't', source: 'ai', priorities: [{ title: 'x', why: 'y', action: 'z', extra: 'no' }], hidden: 1 },
    findings: [{ _id: 'F1', title: 'T', severity: 'high', category: 'C', description: 'd', file: 'a.js', line: 1, cwe: 'CWE-1', recommendation: 'r', snippet: 's', source: 'rule', internalNote: 'no' }],
  };
  const out = publicReport(report);
  const json = JSON.stringify(out);
  for (const leaked of ['U1', 'SECRETTOKEN', 'srv/tmp', 'boom', 'a.zip', 'R1', 'internalNote', 'extra', 'hidden', 'storage']) {
    assert.equal(json.includes(leaked), false, `leaked ${leaked}`);
  }
  assert.equal(out.findings[0].title, 'T');
  assert.equal(out.aiSummary.priorities[0].action, 'z');
  assert.equal(out.riskScore, 60);
});

test('works with a report that has no findings or summary', () => {
  const out = publicReport({ name: 'x', findings: undefined });
  assert.deepEqual(out.findings, []);
  assert.equal(out.aiSummary, undefined);
});
