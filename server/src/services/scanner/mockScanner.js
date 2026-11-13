const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const POOL = [
  {
    title: 'SQL injection in query builder',
    severity: 'critical',
    category: 'Injection',
    cwe: 'CWE-89',
    description: 'User-controlled input is concatenated into a SQL string without parameterization.',
    recommendation: 'Use parameterized queries or an ORM with bound parameters. Validate input types server-side.',
  },
  {
    title: 'Hardcoded API secret in source',
    severity: 'critical',
    category: 'Secrets',
    cwe: 'CWE-798',
    description: 'A long-lived credential is committed in plain text and will be exposed to anyone with repo access.',
    recommendation: 'Rotate the secret immediately, move it to environment variables or a secrets manager.',
  },
  {
    title: 'Missing authorization on admin route',
    severity: 'high',
    category: 'Access Control',
    cwe: 'CWE-862',
    description: 'The route performs privileged actions but only checks that the user is logged in, not their role.',
    recommendation: 'Enforce role-based checks in middleware and add tests for horizontal and vertical privilege escalation.',
  },
  {
    title: 'Insecure object reference (IDOR) on resource fetch',
    severity: 'high',
    category: 'Access Control',
    cwe: 'CWE-639',
    description: 'Resources are fetched by id without verifying the caller owns them.',
    recommendation: 'Scope every query by the authenticated user id and return 404 for foreign resources.',
  },
  {
    title: 'JWT signed with weak fallback secret',
    severity: 'high',
    category: 'Cryptography',
    cwe: 'CWE-321',
    description: 'A default secret is used when the environment variable is missing, making tokens forgeable.',
    recommendation: 'Fail fast on startup if the secret is missing. Use 32+ random bytes.',
  },
  {
    title: 'No rate limiting on login endpoint',
    severity: 'medium',
    category: 'Authentication',
    cwe: 'CWE-307',
    description: 'Unlimited attempts allow credential stuffing and brute force.',
    recommendation: 'Add per-IP and per-account rate limits with progressive backoff and alerting.',
  },
  {
    title: 'Wildcard CORS policy',
    severity: 'medium',
    category: 'Configuration',
    cwe: 'CWE-942',
    description: 'Any origin may call the API with credentials, enabling cross-site request abuse.',
    recommendation: 'Restrict allowed origins to a known list and avoid credentials with wildcard origins.',
  },
  {
    title: 'Stack traces returned to clients',
    severity: 'medium',
    category: 'Information Disclosure',
    cwe: 'CWE-209',
    description: 'Verbose error responses expose file paths, library versions and internal structure.',
    recommendation: 'Return generic errors in production and log details server-side only.',
  },
  {
    title: 'Dependency with known advisory',
    severity: 'low',
    category: 'Supply Chain',
    cwe: 'CWE-1104',
    description: 'An outdated package version has published security advisories.',
    recommendation: 'Upgrade to the patched version and enable automated dependency updates.',
  },
  {
    title: 'Missing HTTP security headers',
    severity: 'low',
    category: 'Configuration',
    cwe: 'CWE-693',
    description: 'Responses lack CSP, X-Content-Type-Options and Referrer-Policy headers.',
    recommendation: 'Add a security headers middleware and a restrictive Content-Security-Policy.',
  },
];

/**
 * Mock provider used for development and UI work. Replace with the real agent
 * by implementing agentScanner.js and setting SCANNER_PROVIDER=agent.
 */
export const mockScanner = {
  name: 'mock',
  async scan({ files, onLog }) {
    const logs = [];
    const log = (line) => {
      logs.push(line);
      if (onLog) onLog(line);
    };

    log(`Mock scanner started for ${files.length} file(s)`);
    for (const step of ['Indexing files...', 'Mapping trust boundaries...', 'Running analysis...', 'Correlating findings...', 'Scoring risk...']) {
      await sleep(1200);
      log(step);
    }

    const targets = files.length ? files : [{ originalName: 'unknown' }];
    const findings = POOL.map((item, i) => ({
      ...item,
      file: targets[i % targets.length].originalName,
      line: 12 + ((i * 37) % 180),
    }));

    log(`Mock scanner finished with ${findings.length} finding(s)`);
    return { findings, logs };
  },
};
