import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyzeHeaders } from '../src/services/headers/analyze.js';
import { isPublicAddress, parseTarget, makeSafeLookup, fetchHeaders, HeaderFetchError } from '../src/services/headers/fetcher.js';

const good = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
  'set-cookie': ['session=abc; Secure; HttpOnly; SameSite=Lax'],
};
const run = (headers, url = 'https://example.com/') => analyzeHeaders({ startUrl: url, finalUrl: url, status: 200, headers });
const byId = (r, id) => r.checks.find((c) => c.id === id);

test('a well configured site gets an A with no fixes needed', () => {
  const r = run(good);
  assert.equal(r.grade, 'A');
  assert.equal(r.score, 100);
  assert.deepEqual(r.summary, { pass: 9, warn: 0, fail: 0 });
  assert.ok(r.checks.every((c) => c.fix === ''));
});

test('a bare site fails most checks and each failure carries a fix', () => {
  const r = run({});
  assert.equal(r.grade, 'F');
  for (const id of ['hsts', 'csp', 'framing', 'nosniff']) assert.equal(byId(r, id).status, 'fail', id);
  assert.match(byId(r, 'csp').fix, /Content-Security-Policy/);
});

test('plain http is always an F', () => {
  const r = run(good, 'http://example.com/');
  assert.equal(byId(r, 'https').status, 'fail');
  assert.equal(r.grade, 'F');
});

test('redirect from http to https is fine', () => {
  const r = analyzeHeaders({ startUrl: 'http://example.com/', finalUrl: 'https://example.com/', status: 200, headers: good });
  assert.match(byId(r, 'https').detail, /redirects/);
  assert.equal(r.grade, 'A');
});

test('hsts, csp and cookie details', () => {
  assert.equal(byId(run({ ...good, 'strict-transport-security': 'max-age=300' }), 'hsts').status, 'warn');
  assert.equal(byId(run({ ...good, 'content-security-policy': "default-src 'self' 'unsafe-inline'" }), 'csp').status, 'warn');
  assert.equal(byId(run({ ...good, 'content-security-policy': "script-src *" }), 'csp').status, 'warn');
  assert.equal(byId(run({ ...good, 'content-security-policy-report-only': "default-src 'self'", 'content-security-policy': undefined }), 'csp').status, 'warn');
  assert.equal(byId(run({ ...good, 'set-cookie': ['session=abc'] }), 'cookies').status, 'fail');
  assert.equal(byId(run({ ...good, 'set-cookie': ['theme=dark; Secure; HttpOnly'] }), 'cookies').status, 'warn');
  assert.equal(byId(run({ ...good, 'set-cookie': undefined }), 'cookies').status, 'pass');
});

test('software details and CORS are reported', () => {
  assert.equal(byId(run({ ...good, server: 'nginx/1.18.0' }), 'leaks').status, 'warn');
  assert.equal(byId(run({ ...good, 'x-powered-by': 'Express' }), 'leaks').status, 'warn');
  assert.equal(byId(run({ ...good, server: 'cloudflare' }), 'leaks').status, 'pass');
  assert.equal(byId(run({ ...good, 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' }), 'cors').status, 'fail');
  assert.equal(byId(run(good), 'cors'), undefined);
});

test('public and private addresses are told apart', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.1.1.1', '64:ff9b::7f00:1', 'not an ip', ''])
    assert.equal(isPublicAddress(ip), false, ip);
});

test('addresses typed by people are validated', () => {
  assert.equal(parseTarget('example.com').protocol, 'https:');
  assert.equal(parseTarget('http://8.8.8.8/').hostname, '8.8.8.8');
  assert.equal(parseTarget('http://example.com').protocol, 'http:');
  for (const bad of ['', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@example.com', 'https://example.com:8080',
    'localhost', 'http://localhost', 'http://app.localhost', 'intranet', 'http://printer.local', 'http://metadata.internal', 'https://', 'x'.repeat(2500),
    'http://169.254.169.254/latest/meta-data', 'http://127.0.0.1', 'http://[::1]/', 'http://[::ffff:10.0.0.1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'https://192.168.0.1', 'http://0/'])
    assert.throws(() => parseTarget(bad), HeaderFetchError, bad);
});

test('the safe lookup refuses private answers, even if only one of several is private', async () => {
  const fake = (answers) => (_h, _o, cb) => cb(null, answers);
  const ask = (answers, opts = { all: true }) => new Promise((res) => makeSafeLookup(fake(answers))('x.com', opts, (err, a) => res({ err, a })));
  assert.ok((await ask([{ address: '8.8.8.8', family: 4 }])).a);
  assert.ok((await ask([{ address: '127.0.0.1', family: 4 }])).err instanceof HeaderFetchError);
  assert.ok((await ask([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }])).err);
  assert.ok((await ask([])).err);
});

test('fetching: headers are read, redirects followed and checked, body never needed', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/start') return res.writeHead(302, { location: '/end' }).end();
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/evil') return res.writeHead(302, { location: 'ftp://example.com/' }).end();
    res.writeHead(200, { 'x-content-type-options': 'nosniff', 'set-cookie': ['a=1; HttpOnly'] });
    res.write('x'.repeat(1000));
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetchHeaders(`${base}/start`, { allowPrivate: true });
    assert.equal(r.status, 200);
    assert.equal(r.redirects.length, 1);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    await assert.rejects(fetchHeaders(`${base}/loop`, { allowPrivate: true, maxRedirects: 3 }), /too many times/);
    await assert.rejects(fetchHeaders(`${base}/evil`, { allowPrivate: true }), /redirected somewhere/);
    // the real (non-test) path refuses a local server outright
    await assert.rejects(fetchHeaders(`${base}/start`), HeaderFetchError);
    await assert.rejects(fetchHeaders('http://127.0.0.1/'), HeaderFetchError);
  } finally {
    server.close();
  }
});
