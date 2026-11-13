import crypto from 'node:crypto';

// API tokens for CI. Shown to the person once; only a hash is stored, so a database leak does not leak working tokens.
export const TOKEN_PREFIX = 'tm_';

export const hashApiToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const looksLikeApiToken = (t) => typeof t === 'string' && /^tm_[A-Za-z0-9_-]{40,64}$/.test(t);

export function newApiToken() {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { token, hash: hashApiToken(token), display: `${token.slice(0, 7)}...${token.slice(-4)}` };
}
