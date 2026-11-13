import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { verifySignature, parsePush, pushMatches, evaluateScan, newId, isWebhookId } from '../src/services/watchLogic.js';
import { projectName } from '../src/services/compare.js';

const sign = (secret, body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

test('signature check accepts only the right secret and the exact body', () => {
  const body = Buffer.from('{"a":1}');
  const good = sign('s3cret', body);
  assert.equal(verifySignature('s3cret', body, good), true);
  assert.equal(verifySignature('other', body, good), false);
  assert.equal(verifySignature('s3cret', Buffer.from('{"a":2}'), good), false);
  for (const bad of [undefined, '', 'sha1=abc', 'sha256=', 'sha256=zz', 'sha256=' + 'a'.repeat(64)]) assert.equal(verifySignature('s3cret', body, bad), false);
  assert.equal(verifySignature('', body, good), false);
  assert.equal(verifySignature('s3cret', 'not a buffer', good), false);
});

const payload = (over = {}) => ({
  ref: 'refs/heads/main', after: 'a'.repeat(40), repository: { full_name: 'Dyna/Shop', default_branch: 'main' },
  head_commit: { message: 'Fix login\n\nlong body', author: { name: 'Daniel' } }, pusher: { name: 'dan' }, ...over,
});

test('push parsing and matching', () => {
  const push = parsePush(payload());
  assert.deepEqual([push.branch, push.message, push.author, push.deleted], ['main', 'Fix login', 'Daniel', false]);
  const watch = { owner: 'dyna', repo: 'shop', branch: '' };
  assert.equal(pushMatches(watch, push).ok, true);
  assert.equal(pushMatches({ ...watch, branch: 'dev' }, push).ok, false);
  assert.equal(pushMatches({ ...watch, repo: 'blog' }, push).ok, false);
  assert.equal(pushMatches(watch, parsePush(payload({ ref: 'refs/heads/feature' }))).ok, false);
  assert.equal(pushMatches(watch, parsePush(payload({ ref: 'refs/tags/v1' }))).ok, false);
  assert.equal(pushMatches(watch, parsePush(payload({ deleted: true, after: '0'.repeat(40) }))).ok, false);
  assert.equal(pushMatches(watch, parsePush(payload({ after: 'xyz; rm -rf' }))).ok, false);
  assert.deepEqual(parsePush(null).sha, '');
});

const f = (title, file, severity = 'medium') => ({ title, file, category: 'C', severity });

test('evaluation: baseline, ok and warning', () => {
  const cur = { riskScore: 40, findings: [f('A', 'a.js'), f('B', 'b.js', 'high')] };
  assert.equal(evaluateScan(null, cur).status, 'baseline');
  assert.equal(evaluateScan(cur, cur).status, 'ok');
  const worse = evaluateScan({ riskScore: 10, findings: [f('A', 'a.js')] }, cur);
  assert.deepEqual([worse.status, worse.newCount, worse.newSevere, worse.scoreChange], ['warning', 1, 1, 30]);
  assert.match(worse.newTitles[0], /B \(b\.js\)/);
  const better = evaluateScan(cur, { riskScore: 5, findings: [f('A', 'a.js')] });
  assert.deepEqual([better.status, better.fixedCount], ['ok', 1]);
});

test('ids look right and project names drop the commit suffix', () => {
  assert.ok(isWebhookId(newId()));
  assert.equal(isWebhookId('../x'), false);
  assert.equal(projectName('dyna/shop @ a1b2c3d'), 'dyna/shop');
  assert.equal(projectName('my scan'), 'my scan');
});

test('server and client copies of compare.js are identical', () => {
  const a = fs.readFileSync(new URL('../src/services/compare.js', import.meta.url), 'utf8');
  const b = fs.readFileSync(new URL('../../client/src/lib/compare.js', import.meta.url), 'utf8');
  assert.equal(a, b);
});
