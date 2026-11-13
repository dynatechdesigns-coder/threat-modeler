import test from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, makeToken, looksLikeToken, RESET_TTL } from '../src/services/tokens.js';
import { sendEmail, verificationEmail, resetEmail, pushAlertEmail, escapeHtml, EmailError } from '../src/services/email.js';

const cfg = { brevoApiKey: 'KEY', emailFrom: 'me@example.com', emailFromName: 'TM' };

test('tokens: hashed, unique, expiring and shape-checked', () => {
  const now = 1_000_000;
  const a = makeToken(RESET_TTL, now);
  assert.ok(looksLikeToken(a.token));
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.notEqual(a.token, makeToken(RESET_TTL).token);
  assert.equal(a.expires.getTime(), now + RESET_TTL);
  for (const bad of ['', 'abc', null, undefined, {}, 'x'.repeat(44), '$ne'.padEnd(43, 'a')]) assert.equal(looksLikeToken(bad), false);
});

test('sending posts the right request to Brevo and hides failures details', async () => {
  let seen;
  const ok = async (url, opts) => ((seen = { url, opts }), new Response('{}', { status: 201 }));
  await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T', html: '<p>H</p>' }, { fetchImpl: ok, config: cfg });
  assert.equal(seen.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(seen.opts.headers['api-key'], 'KEY');
  const body = JSON.parse(seen.opts.body);
  assert.deepEqual([body.sender.email, body.to[0].email, body.subject], ['me@example.com', 'a@b.com', 'S']);

  const secretBody = async () => new Response('KEY leaked here', { status: 401 });
  await assert.rejects(sendEmail({ to: 'a@b.com', subject: 'S', text: 'T', html: 'H' }, { fetchImpl: secretBody, config: cfg }), (e) => e instanceof EmailError && !e.message.includes('KEY') && /401/.test(e.message));
  await assert.rejects(sendEmail({ to: 'a@b.com' }, { config: { brevoApiKey: '', emailFrom: '' } }), /not set up/);
  await assert.rejects(sendEmail({ to: 'not-an-email', subject: 'S' }, { config: cfg }), /Invalid recipient/);
  await assert.rejects(sendEmail({ to: 'a@b.com', subject: 'S' }, { fetchImpl: async () => { throw new Error('boom'); }, config: cfg }), /Could not reach/);
});

test('templates escape everything that came from users', () => {
  const evil = '<script>alert(1)</script>';
  for (const m of [
    verificationEmail({ name: evil, url: 'https://x.com/?a=1&b="2"' }),
    resetEmail({ name: evil, url: 'https://x.com/r' }),
    pushAlertEmail({ name: evil, repo: evil, sha: 'a'.repeat(40), message: evil, newCount: 2, newSevere: 1, titles: [evil], url: 'https://x.com/r' }),
  ]) {
    assert.equal(m.html.includes('<script>'), false);
    assert.ok(m.subject.length > 5);
  }
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  assert.match(pushAlertEmail({ name: 'D', repo: 'a/b', sha: 'abcdef1234', message: '', newCount: 1, newSevere: 0, titles: ['T'], url: 'u' }).subject, /1 new problem in a\/b/);
});

import { isAdminUser } from '../src/services/admin.js';

test('admin: listed AND confirmed addresses only', () => {
  const list = ['boss@example.com'];
  assert.equal(isAdminUser({ email: 'boss@example.com', emailVerified: true }, list), true);
  assert.equal(isAdminUser({ email: 'Boss@Example.com', emailVerified: true }, list), true);
  assert.equal(isAdminUser({ email: 'boss@example.com', emailVerified: false }, list), false); // registered with someone else's address
  assert.equal(isAdminUser({ email: 'boss@example.com' }, list), false);
  assert.equal(isAdminUser({ email: 'other@example.com', emailVerified: true }, list), false);
  assert.equal(isAdminUser({ email: 'boss@example.com', emailVerified: true }, []), false);
  assert.equal(isAdminUser(null, list), false);
});
