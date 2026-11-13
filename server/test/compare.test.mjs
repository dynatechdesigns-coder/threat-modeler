import test from 'node:test';
import assert from 'node:assert/strict';
import { compareScans, defaultPair } from '../../client/src/lib/compare.js';

const f = (title, file, severity = 'high', line = 1) => ({ title, file, category: 'C', severity, line });

test('splits findings into new, fixed and still open, ignoring line numbers', () => {
  const older = { riskScore: 70, findings: [f('A', 'a.js', 'high', 10), f('B', 'b.js', 'critical')] };
  const newer = { riskScore: 40, findings: [f('A', 'a.js', 'high', 55), f('C', 'c.js', 'low')] };
  const r = compareScans(older, newer);
  assert.deepEqual(r.remaining.map((x) => x.title), ['A']);
  assert.deepEqual(r.fixed.map((x) => x.title), ['B']);
  assert.deepEqual(r.added.map((x) => x.title), ['C']);
  assert.equal(r.scoreChange, -30);
  assert.equal(r.totalChange, 0);
});

test('duplicates are matched one-to-one', () => {
  const r = compareScans({ findings: [f('A', 'a.js'), f('A', 'a.js')] }, { findings: [f('A', 'a.js')] });
  assert.equal(r.fixed.length, 1);
  assert.equal(r.remaining.length, 1);
  assert.equal(r.added.length, 0);
});

test('empty and missing inputs do not crash', () => {
  const r = compareScans({}, { findings: [f('A', 'a')] });
  assert.equal(r.added.length, 1);
  assert.equal(compareScans(undefined, undefined).scoreChange, 0);
});

test('default pair prefers the previous scan of the same project', () => {
  const reports = [
    { _id: '1', name: 'shop', status: 'completed', completedAt: '2026-11-01' },
    { _id: '2', name: 'blog', status: 'completed', completedAt: '2026-11-05' },
    { _id: '3', name: 'shop', status: 'completed', completedAt: '2026-11-10' },
    { _id: '4', name: 'shop', status: 'failed', completedAt: '2026-11-11' },
  ];
  assert.deepEqual(defaultPair(reports), { older: '1', newer: '3' });
  assert.deepEqual(defaultPair(reports, '1'), { older: '3', newer: '1' }); // nothing earlier, so it falls back to the same project
  assert.deepEqual(defaultPair([]), { older: null, newer: null });
});
