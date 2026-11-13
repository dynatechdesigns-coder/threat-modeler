// Startup checks. Kept free of dotenv so they can be tested on their own.

const PLACEHOLDER_SECRETS = new Set([
  'change-this-to-a-long-random-string',
  'dev-only-insecure-secret',
  'secret',
  'changeme',
]);

/** Returns a list of problems that must stop the server from starting in production. */
export function productionProblems(e) {
  const problems = [];
  if (!e.jwtSecret || e.jwtSecret.length < 32 || PLACEHOLDER_SECRETS.has(e.jwtSecret)) {
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  if (!e.mongoUriFromEnv) problems.push('MONGODB_URI must be set (production never falls back to a local database)');
  if (!e.clientOriginFromEnv) problems.push('CLIENT_ORIGIN must be set to your frontend address, for example https://yourapp.vercel.app');
  if (e.clientOrigins.some((o) => o === '*')) problems.push('CLIENT_ORIGIN must not be *');
  return problems;
}

export const parseOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
