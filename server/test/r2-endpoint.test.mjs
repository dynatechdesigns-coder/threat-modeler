import test from 'node:test';
import assert from 'node:assert/strict';
import { r2Endpoint } from '../src/services/storage.service.js';

const ACCOUNT_ID = 'abc123def456';

// The EU-jurisdiction bucket must use the jurisdictional endpoint:
// the standard endpoint answers AccessDenied (403) for EU buckets.
test('default jurisdiction uses the standard R2 endpoint', () => {
  assert.equal(r2Endpoint(ACCOUNT_ID), `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
});

test('unset or empty jurisdiction keeps the standard endpoint', () => {
  assert.equal(r2Endpoint(ACCOUNT_ID, ''), `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(r2Endpoint(ACCOUNT_ID, undefined), `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
});

test('R2_JURISDICTION=eu selects the EU endpoint', () => {
  assert.equal(r2Endpoint(ACCOUNT_ID, 'eu'), `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`);
});

test('jurisdiction matching ignores case and surrounding whitespace', () => {
  assert.equal(r2Endpoint(ACCOUNT_ID, 'EU'), `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`);
  assert.equal(r2Endpoint(ACCOUNT_ID, ' eu '), `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`);
});

test('unknown jurisdiction falls back to the standard endpoint', () => {
  assert.equal(r2Endpoint(ACCOUNT_ID, 'us'), `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
});

test('the account ID is used verbatim as the subdomain', () => {
  const endpoint = new URL(r2Endpoint(ACCOUNT_ID, 'eu'));
  assert.equal(endpoint.hostname, `${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`);
  assert.equal(endpoint.protocol, 'https:');
});
