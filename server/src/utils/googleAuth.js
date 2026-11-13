import crypto from 'node:crypto';

// Verifies a Google "Sign in with Google" ID token without any extra packages:
// check the RS256 signature against Google's published keys, then the issuer, audience, expiry and verified email.

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const KEY_TTL_MS = 60 * 60 * 1000;

let cache = { keys: [], at: 0 };

async function loadKeys(fetchImpl, force) {
  if (!force && cache.keys.length && Date.now() - cache.at < KEY_TTL_MS) return cache.keys;
  const res = await fetchImpl(CERTS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('Could not load Google signing keys');
  const { keys } = await res.json();
  cache = { keys: Array.isArray(keys) ? keys : [], at: Date.now() };
  return cache.keys;
}

const decode = (part) => Buffer.from(part, 'base64url');

export async function verifyGoogleIdToken(token, { clientId, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (!clientId) throw new Error('Google sign-in is not configured');
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = JSON.parse(decode(parts[0]).toString('utf8'));
  const payload = JSON.parse(decode(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token');

  let jwk = (await loadKeys(fetchImpl, false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await loadKeys(fetchImpl, true)).find((k) => k.kid === header.kid); // Google rotates keys
  if (!jwk) throw new Error('Unknown signing key');

  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    decode(parts[2])
  );
  if (!valid) throw new Error('Bad signature');
  if (!ISSUERS.has(payload.iss)) throw new Error('Wrong issuer');
  if (payload.aud !== clientId) throw new Error('Token was issued for a different app');
  if (!payload.exp || payload.exp * 1000 <= now) throw new Error('Token expired');
  if (!payload.sub || !payload.email) throw new Error('Token has no email');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('Email is not verified');

  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || '').slice(0, 80) };
}
