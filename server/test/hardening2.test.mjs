import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadSources } from '../src/services/scanner/agent/fileLoader.js';
import { verifyGoogleIdToken } from '../src/utils/googleAuth.js';

// ---- skipping test folders ----
// Built at runtime so no secret-looking text sits in the source (GitHub push protection would block it).
const FAKE_STRIPE = ['sk', 'live', '51H8abcdefghijklmnop1234'].join('_');
const fakeFiles = {
  'src/app.js': 'const a = 1;\n',
  'test/app.test.js': `const key = '${FAKE_STRIPE}';\n`,
  'src/__tests__/x.js': 'const b = 2;\n',
  'src/util.spec.ts': 'const c = 3;\n',
  'fixtures/.env': 'DB_PASSWORD=hunter2hunter2\n',
};
const load = (includeTests) =>
  loadSources({
    files: Object.keys(fakeFiles).map((n) => ({ originalName: n, key: n, storage: 'local' })),
    readFile: async (key) => Buffer.from(fakeFiles[key]),
    includeTests,
  });

test('test and fixture files are skipped by default, but .env files are kept', async () => {
  const { sources, stats } = await load(false);
  assert.deepEqual(sources.map((s) => s.path).sort(), ['fixtures/.env', 'src/app.js']);
  assert.equal(stats.tests, 3);
});

test('test files are included when asked for', async () => {
  const { sources, stats } = await load(true);
  assert.equal(sources.length, 5);
  assert.equal(stats.tests, 0);
});

// ---- Google ID token verification (with a locally generated key standing in for Google) ----
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const CLIENT = 'my-client-id.apps.googleusercontent.com';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function makeToken(overrides = {}, signWith = privateKey, kid = 'k1') {
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT,
    sub: '1234567890',
    email: 'Daniel@Example.com',
    email_verified: true,
    name: 'Daniel',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), signWith).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const fetchKeys = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const verify = (token) => verifyGoogleIdToken(token, { clientId: CLIENT, fetchImpl: fetchKeys });

test('Google: a valid token is accepted and the email is lowercased', async () => {
  const g = await verify(makeToken());
  assert.equal(g.email, 'daniel@example.com');
  assert.equal(g.sub, '1234567890');
});

test('Google: wrong signature, audience, issuer, expiry and unverified email are rejected', async () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verify(makeToken({}, other)), /signature/);
  await assert.rejects(verify(makeToken({ aud: 'someone-elses-app' })), /different app/);
  await assert.rejects(verify(makeToken({ iss: 'https://evil.example' })), /issuer/);
  await assert.rejects(verify(makeToken({ exp: Math.floor(Date.now() / 1000) - 10 })), /expired/);
  await assert.rejects(verify(makeToken({ email_verified: false })), /not verified/);
  await assert.rejects(verify(makeToken({}, privateKey, 'unknown-kid')), /Unknown signing key/);
  await assert.rejects(verify('not.a.token.at.all'), /./);
});

test('Google: refuses to run without a client id', async () => {
  await assert.rejects(verifyGoogleIdToken(makeToken(), { fetchImpl: fetchKeys }), /not configured/);
});
