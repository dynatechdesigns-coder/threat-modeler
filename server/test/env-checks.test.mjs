import test from 'node:test';
import assert from 'node:assert/strict';
import { productionProblems, parseOrigins } from '../src/config/envChecks.js';

const good = {
  jwtSecret: 'a'.repeat(48),
  mongoUriFromEnv: true,
  clientOriginFromEnv: true,
  clientOrigins: ['https://app.example.com'],
};

test('a complete production config has no problems', () => {
  assert.deepEqual(productionProblems(good), []);
});

test('production rejects a missing, short or placeholder JWT secret', () => {
  for (const jwtSecret of ['', 'short', 'change-this-to-a-long-random-string', 'dev-only-insecure-secret']) {
    const p = productionProblems({ ...good, jwtSecret });
    assert.ok(p.some((x) => x.includes('JWT_SECRET')), `"${jwtSecret}" should be rejected`);
  }
});

test('production requires MONGODB_URI and CLIENT_ORIGIN to be set explicitly', () => {
  const p = productionProblems({ ...good, mongoUriFromEnv: false, clientOriginFromEnv: false });
  assert.ok(p.some((x) => x.includes('MONGODB_URI')));
  assert.ok(p.some((x) => x.includes('CLIENT_ORIGIN')));
});

test('production rejects a wildcard origin', () => {
  assert.ok(productionProblems({ ...good, clientOrigins: ['*'] }).some((x) => x.includes('*')));
});

test('origins: comma separated, trimmed, trailing slash removed', () => {
  assert.deepEqual(parseOrigins(' https://a.com/ , https://b.vercel.app '), ['https://a.com', 'https://b.vercel.app']);
  assert.deepEqual(parseOrigins(''), []);
});
