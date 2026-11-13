// Used by /reports/demo so the Threat Report UI can be previewed without a backend.
export const sampleReport = {
  _id: 'demo',
  name: 'demo-shop-api',
  status: 'completed',
  riskScore: 79,
  completedAt: new Date().toISOString(),
  files: [
    { originalName: 'server.js', size: 4210 },
    { originalName: 'db/queries.js', size: 3180 },
    { originalName: 'routes/admin.js', size: 2750 },
  ],
  summary: { critical: 2, high: 3, medium: 3, low: 2, total: 10 },
  aiSummary: {
    source: 'ai',
    text: 'This API has two critical problems that anyone could abuse today: a SQL injection in the query builder and a secret committed to the code. The admin area also does not check roles. Fix these three before anything else.',
    priorities: [
      { title: 'Remove the hardcoded secret', why: 'Anyone with repository access can use it.', action: 'Rotate the secret now and load it from an environment variable.' },
      { title: 'Stop SQL injection in db/queries.js', why: 'User input is joined into the query text.', action: 'Switch to parameterized queries.' },
      { title: 'Add role checks to the admin route', why: 'Any logged-in user can perform admin actions.', action: 'Require an admin role in the route middleware.' },
    ],
  },
  findings: [
    {
      _id: 'd1', title: 'SQL injection in query builder', severity: 'critical', category: 'Injection', cwe: 'CWE-89',
      file: 'db/queries.js', line: 48,
      description: 'User-controlled input is concatenated into a SQL string without parameterization.',
      recommendation: 'Use parameterized queries or an ORM with bound parameters. Validate input types server-side.',
    },
    {
      _id: 'd2', title: 'Hardcoded API secret in source', severity: 'critical', category: 'Secrets', cwe: 'CWE-798',
      file: 'server.js', line: 12,
      description: 'A long-lived credential is committed in plain text and will be exposed to anyone with repo access.',
      recommendation: 'Rotate the secret immediately, move it to environment variables or a secrets manager.',
    },
    {
      _id: 'd3', title: 'Missing authorization on admin route', severity: 'high', category: 'Access Control', cwe: 'CWE-862',
      file: 'routes/admin.js', line: 21,
      description: 'The route performs privileged actions but only checks that the user is logged in, not their role.',
      recommendation: 'Enforce role-based checks in middleware and add tests for privilege escalation.',
    },
    {
      _id: 'd4', title: 'Insecure object reference (IDOR) on resource fetch', severity: 'high', category: 'Access Control', cwe: 'CWE-639',
      file: 'routes/orders.js', line: 67,
      description: 'Resources are fetched by id without verifying the caller owns them.',
      recommendation: 'Scope every query by the authenticated user id and return 404 for foreign resources.',
    },
    {
      _id: 'd5', title: 'JWT signed with weak fallback secret', severity: 'high', category: 'Cryptography', cwe: 'CWE-321',
      file: 'auth/token.js', line: 9,
      description: 'A default secret is used when the environment variable is missing, making tokens forgeable.',
      recommendation: 'Fail fast on startup if the secret is missing. Use 32+ random bytes.',
    },
    {
      _id: 'd6', title: 'No rate limiting on login endpoint', severity: 'medium', category: 'Authentication', cwe: 'CWE-307',
      file: 'routes/auth.js', line: 30,
      description: 'Unlimited attempts allow credential stuffing and brute force.',
      recommendation: 'Add per-IP and per-account rate limits with progressive backoff and alerting.',
    },
    {
      _id: 'd7', title: 'Wildcard CORS policy', severity: 'medium', category: 'Configuration', cwe: 'CWE-942',
      file: 'server.js', line: 25,
      description: 'Any origin may call the API with credentials, enabling cross-site request abuse.',
      recommendation: 'Restrict allowed origins to a known list.',
    },
    {
      _id: 'd8', title: 'Stack traces returned to clients', severity: 'medium', category: 'Information Disclosure', cwe: 'CWE-209',
      file: 'middleware/error.js', line: 14,
      description: 'Verbose error responses expose file paths, library versions and internal structure.',
      recommendation: 'Return generic errors in production and log details server-side only.',
    },
    {
      _id: 'd9', title: 'Dependency with known advisory', severity: 'low', category: 'Supply Chain', cwe: 'CWE-1104',
      file: 'package.json', line: 18,
      description: 'An outdated package version has published security advisories.',
      recommendation: 'Upgrade to the patched version and enable automated dependency updates.',
    },
    {
      _id: 'd10', title: 'Missing HTTP security headers', severity: 'low', category: 'Configuration', cwe: 'CWE-693',
      file: 'server.js', line: 5,
      description: 'Responses lack CSP, X-Content-Type-Options and Referrer-Policy headers.',
      recommendation: 'Add a security headers middleware and a restrictive Content-Security-Policy.',
    },
  ],
};
