import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUrls, MAX_URLS } from '../src/services/links/extract.js';
import { analyzeUrl, verdictFor } from '../src/services/links/heuristics.js';
import { analyzeMessage } from '../src/services/links/spamText.js';
import { checkLinks } from '../src/services/links/index.js';

const verdict = (u) => {
  const { urls } = extractUrls(u);
  assert.equal(urls.length, 1, `expected one url in ${u}`);
  return verdictFor(analyzeUrl(urls[0]).score);
};
const reasonsOf = (u) => analyzeUrl(extractUrls(u).urls[0]).signals.map((s) => s.text).join(' | ');

// ---- extraction ----
test('extract: finds links, trims punctuation, adds https to www, removes duplicates', () => {
  const { urls } = extractUrls('Visit https://a.example/x. Also (www.b.example/y), and https://a.example/x again; bit.ly/abc123!');
  assert.deepEqual(urls.map((u) => u.raw), ['https://a.example/x', 'https://www.b.example/y', 'https://bit.ly/abc123']);
});

test('extract: caps the number of links and says so', () => {
  const text = Array.from({ length: 40 }, (_, i) => `https://site${i}.example/`).join(' ');
  const out = extractUrls(text);
  assert.equal(out.urls.length, MAX_URLS);
  assert.equal(out.truncated, true);
});

test('extract: picks up javascript: and data: links', () => {
  const { urls } = extractUrls('click javascript:alert(1) now');
  assert.equal(urls[0].scheme, 'javascript');
});

// ---- safe links stay quiet ----
test('normal links get no red flags', () => {
  for (const u of [
    'https://google.com',
    'https://www.google.co.uk/search?q=test',
    'https://mail.google.com/mail',
    'https://github.com/dynatechdesigns-coder/threat-modeler',
    'https://threat-modeler1.vercel.app/',
    'https://applepie.com/recipes',
    'https://www.paypal.com/signin',
    'https://amazon.com.au/deals',
  ]) {
    assert.equal(verdict(u), 'ok', `${u} -> ${reasonsOf(u)}`);
  }
});

// ---- risky links are flagged ----
test('brand name on someone else\'s domain is flagged', () => {
  assert.equal(verdict('https://secure-paypal-login.xyz/verify'), 'dangerous');
  assert.ok(['suspicious', 'dangerous'].includes(verdict('https://google.com.evil-site.example/login')));
});

test('look-alike spellings are flagged', () => {
  assert.notEqual(verdict('https://paypa1.com/login'), 'ok');
  assert.notEqual(verdict('https://g00gle.com/'), 'ok');
  assert.notEqual(verdict('https://micr0soft.com/'), 'ok');
  assert.notEqual(verdict('https://arnazon.com/'), 'ok');
});

test('the @ trick is dangerous', () => {
  assert.equal(verdict('https://paypal.com@evil.example/'), 'dangerous');
});

test('raw IP, obfuscated IP, punycode, shorteners and odd ports are flagged', () => {
  assert.notEqual(verdict('http://203.0.113.9/login'), 'ok');
  assert.notEqual(verdict('http://3232235777/'), 'ok');
  assert.notEqual(verdict('https://xn--pypal-4ve.com/'), 'ok');
  assert.notEqual(verdict('https://bit.ly/abc'), 'ok');
  assert.match(reasonsOf('http://203.0.113.9:8080/x'), /port/);
});

test('program downloads and open redirects are flagged', () => {
  assert.notEqual(verdict('https://downloads.example.com/setup.exe'), 'ok');
  assert.match(reasonsOf('https://site.example/go?url=https://other.example/'), /passes you on/);
});

test('javascript: links are dangerous', () => {
  const score = analyzeUrl(extractUrls('javascript:alert(1)').urls[0]).score;
  assert.equal(verdictFor(score), 'dangerous');
});

// ---- message wording ----
test('a scam message is flagged and an everyday one is not', () => {
  const scam = analyzeMessage('URGENT!!! Congratulations you have won ₦5,000,000. Send your BVN and OTP within 24 hours to claim your prize. Pay a small processing fee.');
  assert.equal(scam.verdict, 'spam');
  assert.ok(scam.reasons.length >= 3);

  const normal = analyzeMessage('Hi, the meeting moved to 3pm. Agenda is here: https://docs.example.com/agenda. Thanks!');
  assert.equal(normal.verdict, 'ok');
  assert.deepEqual(normal.reasons, []);
});

// ---- the whole check ----
const SCAM = 'Your account will be suspended! Verify now: http://secure-paypal-login.xyz/verify. Ignore this: https://github.com/x/y';

test('checkLinks: verdicts, summary, and no network without a Safe Browsing key', async () => {
  const calls = [];
  const out = await checkLinks({ text: SCAM, fetchImpl: async (...a) => { calls.push(a); throw new Error('no network expected'); } });
  assert.equal(calls.length, 0);
  assert.equal(out.overall, 'dangerous');
  assert.equal(out.summary.dangerous, 1);
  assert.equal(out.summary.ok, 1);
  assert.ok(out.notes.some((n) => n.includes('not switched on')));
  assert.ok(out.urls.every((u) => !('href' in u)), 'internal href is not returned');
});

test('checkLinks: Google Safe Browsing results are merged, and only link addresses are sent', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ matches: [{ threatType: 'SOCIAL_ENGINEERING', threat: { url: 'https://github.com/x/y' } }] }) };
  };
  const out = await checkLinks({ text: SCAM, safeBrowsingKey: 'KEY', fetchImpl });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /threatMatches:find\?key=KEY$/);
  const sent = JSON.stringify(calls[0].body);
  assert.ok(!sent.includes('suspended'), 'message wording must not be sent to Google');
  const hit = out.urls.find((u) => u.url.includes('github.com'));
  assert.equal(hit.verdict, 'dangerous');
  assert.ok(hit.sources.includes('Google Safe Browsing'));
  assert.ok(hit.reasons[0].text.includes('phishing'));
});

test('checkLinks: if Google cannot be reached, local results still come back with a note', async () => {
  const out = await checkLinks({ text: SCAM, safeBrowsingKey: 'KEY', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(out.overall, 'dangerous');
  assert.ok(out.notes.some((n) => n.includes('could not be reached')));
});

test('checkLinks: text without links still gets message analysis', async () => {
  const out = await checkLinks({ text: 'Send your OTP and BVN now to claim your prize' });
  assert.equal(out.urls.length, 0);
  assert.notEqual(out.message.verdict, 'ok');
});
