import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPdf, toPdfText } from '../../client/src/lib/pdf.js';

const report = {
  name: 'Demo (ünï) with (parens) and \\ backslash',
  completedAt: '2026-11-11T10:00:00Z',
  riskScore: 55,
  summary: { critical: 1, high: 1, medium: 0, low: 0 },
  aiSummary: { text: 'Fix the secrets first.', source: 'rules', priorities: [{ title: 'Rotate', why: 'Public', action: 'Revoke' }] },
  findings: [
    { title: 'Hardcoded credential', severity: 'critical', category: 'Secrets', file: 'a.js', line: 3, description: 'bad '.repeat(500), recommendation: 'Rotate', snippet: '3| const k = "x"' },
    { title: 'Possible SQL injection (query built from strings)', severity: 'high', category: 'Injection', file: 'q.py', description: 'd', recommendation: 'r' },
  ],
};

test('produces a structurally valid PDF', () => {
  const bytes = buildReportPdf(report);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  // every xref offset must point at "N 0 obj"
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
  const lines = text.slice(xrefAt).split('\n');
  const count = Number(lines[1].split(' ')[1]);
  for (let n = 1; n < count; n++) {
    const off = Number(lines[2 + n].slice(0, 10));
    assert.ok(text.startsWith(`${n} 0 obj`, off), `object ${n} offset`);
  }
  assert.match(text, /\/Count \d+/);
});

test('escapes special characters and flattens non-Latin text', () => {
  const text = Buffer.from(buildReportPdf(report)).toString('latin1');
  assert.ok(text.includes('with \\(parens\\)'));
  assert.ok(text.includes('\\\\ backslash'));
  assert.equal(toPdfText('naïve “x” — ok 你'), 'naive "x" - ok ?');
});

test('a very long report spans several pages and still works with no findings', () => {
  const many = { ...report, findings: Array.from({ length: 60 }, (_, i) => ({ ...report.findings[0], title: `F${i}` })) };
  const pages = Number(/\/Count (\d+)/.exec(Buffer.from(buildReportPdf(many)).toString('latin1'))[1]);
  assert.ok(pages > 5);
  assert.ok(buildReportPdf({ name: 'x', findings: [] }).length > 500);
});
