import crypto from 'node:crypto';

// One-time tokens for email links (verify email, reset password).
// The token itself only ever travels by email. The database keeps a SHA-256 hash of it, so someone who reads the
// database cannot use the links.

export const HOUR = 60 * 60 * 1000;
export const VERIFY_TTL = 72 * HOUR;
export const RESET_TTL = 1 * HOUR;

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function makeToken(ttlMs, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), expires: new Date(now + ttlMs) };
}

/** Quick shape check so junk never reaches the database. */
export const looksLikeToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
