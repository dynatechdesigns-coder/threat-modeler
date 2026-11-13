import { isEnvFile, TEST_PATH } from './fileLoader.js';
import { INFRA_RULES, infraKind } from './infraRules.js';

export { TEST_PATH };

const JS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte']);
const JS_HTML = new Set([...JS, 'html']);
const PY = new Set(['py']);
const PHP = new Set(['php']);

const REQ_INPUT = /\b(?:req|request)\.(?:params|query|body|headers)\b|\$_(?:GET|POST|REQUEST)/;
const SQL_INTERPOLATION = /\$\{|["'`]\s*\+\s*[\w(]|[\w)]\s*\+\s*["'`]|\bf["'][^"']*\{|\.format\(|["']\s*%\s*[\w(]/;

// ---------------------------------------------------------------------------
// "Does this value come from the request?" A light check, per file and line by line. A variable is marked when it is
// assigned from request input (or from another marked variable) and unmarked when it is overwritten with something
// else or passed through a cleaning function. It is not full data-flow analysis, but it lets rules stay quiet about
// values that never touch user input.
// ---------------------------------------------------------------------------
const TAINT_SRC = /\$_(?:GET|POST|REQUEST|COOKIE|FILES)\b|\b(?:req|request)\.(?:params|query|body|headers|cookies)\b|\brequest\.(?:args|form|values|json|GET|POST)\b/;
const CLEANERS =
  /\b(?:mysqli_real_escape_string|mysql_real_escape_string|real_escape_string|addslashes|intval|floatval|escapeshellarg|escapeshellcmd|htmlspecialchars|htmlentities|md5|sha1|hash|parseInt|parseFloat|Number|encodeURIComponent|basename|filter_var|password_hash|bcrypt\.\w+|mysqli_query|mysqli_fetch\w*|mysqli_num_rows|mysqli_error|mysql_query)\s*\(|\(\s*(?:int|float)\s*\)/;
// SQL text and database results are not treated as request data when looking for XSS or SSRF.
const SQL_TEXT = /\b(?:select|insert|update|delete)\b[^"']*\b(?:from|into|set)\b/i;
const PHP_ASSIGN = /^\s*\$(\w+)\s*(\.?)=(?!=)\s*(.+)$/;
const JS_ASSIGN = /^\s*(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(.+)$/;
const JS_DESTRUCT = /^\s*(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(.+)$/;
const PY_ASSIGN = /^\s*(\w+)\s*=(?!=)\s*(.+)$/;

const wordRe = (name, php) => new RegExp(php ? `\\$${name}\\b` : `(?<![.\\w$])${name}\\b`);

function createTaint(ext) {
  const names = new Set();
  const php = ext === 'php';
  const mentions = (text) => {
    if (TAINT_SRC.test(text)) return true;
    for (const n of names) if (wordRe(n, php).test(text)) return true;
    return false;
  };
  return {
    isTainted: (name) => names.has(name),
    uses: mentions,
    /** Like uses(), but ignores the variable being assigned on this line, so `$html .= '<p>fixed text</p>'` is not judged by `$html`. */
    usesRhs: (line) => mentions(line.replace(/^\s*\$?[\w.]+(?:\[[^\]]*\])*\s*\.?=(?!=)/, '')),
    /** Call once per line, after the rules ran, so a line is judged by what was known before it. */
    learn(line) {
      // A variable that was just checked (startsWith, an allow-list test, an isSafe()/validate() call) is treated as clean afterwards.
      for (const n of [...names]) {
        const q = n.replace(/[$]/g, '\\$&');
        if (new RegExp(`\\b${q}\\.(?:startsWith)\\(|\\.(?:test|includes|has)\\(\\s*${q}\\s*\\)|\\b(?:is|valid|check|allow|safe|verify)\\w*\\(\\s*${q}\\b`, 'i').test(line)) names.delete(n);
      }
      const set = (name, rhs, append = false) => {
        if (CLEANERS.test(rhs) || SQL_TEXT.test(rhs)) return void names.delete(name);
        if (mentions(rhs)) names.add(name);
        else if (!append) names.delete(name);
      };
      let m;
      if (php && (m = line.match(PHP_ASSIGN))) return set(m[1], m[3], m[2] === '.');
      if (JS.has(ext) && (m = line.match(JS_DESTRUCT))) {
        const from = m[2];
        for (const part of m[1].split(',')) {
          const name = part.split(':').pop().split('=')[0].trim();
          if (/^\w+$/.test(name)) set(name, from);
        }
        return undefined;
      }
      if (JS.has(ext) && (m = line.match(JS_ASSIGN))) return set(m[1], m[2]);
      if (PY.has(ext) && (m = line.match(PY_ASSIGN))) return set(m[1], m[2]);
      return undefined;
    },
  };
}

const DOC_EXTS = new Set(['html', 'ejs', 'hbs']);
const PHP_QUERY_VAR = /"[^"]*\$[A-Za-z_]\w*[^"]*"/;

// ---------------------------------------------------------------------------
// Secrets (also used to redact values before they appear in a report or leave the server)
// ---------------------------------------------------------------------------
export const SECRET_PATTERNS = [
  { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/g, title: 'AWS access key ID in source' },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, title: 'Private key in source' },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g, title: 'GitHub token in source' },
  { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, title: 'Slack token in source' },
  { id: 'stripe-live', re: /sk_live_[0-9a-zA-Z]{16,}/g, title: 'Stripe live secret key in source' },
  { id: 'google-api', re: /AIza[0-9A-Za-z_-]{35}/g, title: 'Google API key in source' },
  { id: 'ai-api-key', re: /sk-[A-Za-z0-9_-]{32,}/g, title: 'AI provider API key in source' },
];

const GENERIC_SECRET =
  /(?<!-)(?:api[_-]?key|secret|token|passw(?:or)?d|passwd|pwd|private[_-]?key|client[_-]?secret|auth[_-]?key)\w*["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i;
const ENV_SECRET =
  /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*["']?(?!\$\{|your|change|example|placeholder|xxx)[^\s"']{6,}/i;
const PLACEHOLDER = /^(?:your|change|example|test|dummy|sample|placeholder|xxx+|\*+|<|\$\{|%\(|\{\{|process\.env|env\()|changeme|placeholder|example|your[_-]/i;

const maskPrefix = (v) => `${v.slice(0, 4)}…[REDACTED]`;

/** Masks anything that looks like a secret. Always applied before snippets are stored or code is sent to an AI. */
export function redactLine(line, { env = false } = {}) {
  let out = line;
  for (const p of SECRET_PATTERNS) out = out.replace(new RegExp(p.re.source, 'g'), (m) => maskPrefix(m));
  out = out.replace(new RegExp(GENERIC_SECRET.source, 'gi'), (m, v) => m.replace(v, '[REDACTED]'));
  if (env) out = out.replace(/(=\s*["']?)([^\s"']{4,})/, (_m, a) => `${a}[REDACTED]`);
  return out;
}

export function snippetAround(lines, index, env = false) {
  const from = Math.max(0, index - 1);
  const to = Math.min(lines.length - 1, index + 1);
  const out = [];
  for (let i = from; i <= to; i++) {
    out.push(`${i + 1}| ${redactLine(lines[i], { env }).trimEnd().slice(0, 200)}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const SECRET_RULES = SECRET_PATTERNS.map((p) => ({
  id: `secret-${p.id}`,
  title: p.title,
  severity: 'critical',
  category: 'Secrets',
  cwe: 'CWE-798',
  scope: 'any',
  re: new RegExp(p.re.source),
  description: 'A live credential appears to be committed in the code. Anyone with access to the code or its history can use it.',
  recommendation:
    'Revoke and rotate this credential now, then load it from an environment variable or a secrets manager. Remove it from version control history.',
}));

const RULES = [
  ...SECRET_RULES,
  {
    id: 'env-secret',
    title: 'Secret stored in a .env file that was uploaded',
    severity: 'high',
    category: 'Secrets',
    cwe: 'CWE-798',
    scope: 'env',
    re: ENV_SECRET,
    description: 'A .env file with real-looking secrets is part of the code you uploaded. These files often end up in repositories and archives.',
    recommendation: 'Keep .env files out of version control (.gitignore), rotate the exposed values, and ship a .env.example with placeholders instead.',
  },
  {
    id: 'generic-secret',
    title: 'Hardcoded credential',
    severity: 'high',
    category: 'Secrets',
    cwe: 'CWE-798',
    skipTests: true,
    re: GENERIC_SECRET,
    // Skip placeholders and constants like TOKEN_KEY = 'tm_token' (a storage key name, not a credential)
    when: (line, _ctx, m) =>
      !PLACEHOLDER.test(m[1]) &&
      !/^\$/.test(m[1]) && // a PHP variable name, not a value
      !/^0x[0-9a-f]{20,}$/i.test(m[1]) && // a public blockchain address
      !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(m[1]) && // a constant or translation key like SHOW_PWD_TOOLTIP
      !(/^[a-z]+(?:[_.:-][a-z]+)+$/.test(m[1]) && /\b[A-Z][A-Z0-9_]*(?:KEY|NAME|ID|HEADER|COOKIE)\b/.test(line)),
    description: 'A password, key or token is written directly in the code as a string literal.',
    recommendation: 'Move the value to an environment variable or secrets manager and rotate it, since it may already be exposed.',
  },
  {
    id: 'secret-fallback',
    title: 'Hardcoded fallback for a secret',
    severity: 'high',
    category: 'Cryptography',
    cwe: 'CWE-798',
    exts: JS,
    re: /process\.env\.\w*(?:SECRET|KEY|TOKEN|PASSWORD)\w*\s*(?:\|\||\?\?)\s*["'][^"']{3,}["']/,
    description: 'If the environment variable is missing, the app silently falls back to a known default secret, which attackers can guess or read from the code.',
    recommendation: 'Fail at startup when the secret is missing instead of using a default. Generate at least 32 random bytes for production secrets.',
  },
  {
    id: 'secret-fallback-py',
    title: 'Hardcoded fallback for a secret',
    severity: 'high',
    category: 'Cryptography',
    cwe: 'CWE-798',
    exts: PY,
    re: /os\.(?:environ\.get|getenv)\(\s*["'][^"']*(?:SECRET|KEY|TOKEN|PASSWORD)[^"']*["']\s*,\s*["'][^"']{3,}["']\s*\)/,
    description: 'A default secret is used when the environment variable is missing, so the secret is effectively public.',
    recommendation: 'Raise an error at startup when the secret is not set, and generate strong random values for each environment.',
  },
  {
    id: 'sql-injection',
    title: 'Possible SQL injection (query built from strings)',
    severity: (line, _m, ctx) => (REQ_INPUT.test(line) || ctx?.taint.uses(line) ? 'critical' : 'high'),
    category: 'Injection',
    cwe: 'CWE-89',
    re: /\b(?:select\s+[\w*,.\s`"'()]+?\s+from|insert\s+into|update\s+[\w.`"]+\s+set|delete\s+from)\b/i,
    // PHP puts variables straight inside "double quoted" strings, so it is only flagged when the variable holds request data.
    when: (line, ctx) => SQL_INTERPOLATION.test(line) || (ctx.ext === 'php' && PHP_QUERY_VAR.test(line) && ctx.taint.uses(line)),
    description: 'A SQL statement is assembled by joining strings, so crafted input can change what the query does.',
    recommendation: 'Use parameterized queries (placeholders) or an ORM with bound parameters. Never concatenate user input into SQL.',
  },
  {
    id: 'eval',
    title: 'Dynamic code execution (eval / new Function)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-95',
    re: /(?<![.\w$])eval\s*\(|\bnew\s+Function\s*\(/,
    // eval("fixed text") and new Function('a', 'fixed body') run text the developer wrote, not input.
    when: (line) =>
      !/(?<![.\w$])eval\s*\(\s*(?:"[^"]*"|'[^']*')\s*\)|\bnew\s+Function\s*\(\s*(?:(?:"[^"]*"|'[^']*')\s*,\s*)*(?:"[^"]*"|'[^']*')\s*\)/.test(line),
    description: 'eval and new Function run text as code. If any part of that text comes from a user, they can run their own code on your server or browser.',
    recommendation: 'Remove eval. Parse data with JSON.parse or a purpose-built parser, and use a lookup table instead of building code from strings.',
  },
  {
    id: 'exec-py',
    title: 'Dynamic code execution (exec)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-95',
    exts: PY,
    re: /(?<![.\w])exec\s*\(/,
    description: 'exec runs a string as Python code. User-influenced input here leads to arbitrary code execution.',
    recommendation: 'Avoid exec. Use explicit logic or a safe parser for the data you expect.',
  },
  {
    id: 'cmd-injection-js',
    title: 'Possible command injection (shell command built from strings)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-78',
    exts: JS,
    re: /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|["'][^"']*["']\s*\+|[\w.]+\s*\+)/,
    description: 'A shell command is built by joining strings. Crafted input can add extra commands.',
    recommendation: 'Use execFile or spawn with an argument array (no shell), and validate any value that reaches a command.',
  },
  {
    id: 'cmd-injection-py',
    title: 'Possible command injection (shell execution)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-78',
    exts: PY,
    re: /\bos\.(?:system|popen)\(|\bsubprocess\.\w+\([^)]*shell\s*=\s*True/,
    description: 'Commands run through a shell are vulnerable if any part of the command comes from user input.',
    recommendation: 'Use subprocess.run with a list of arguments and shell=False, and validate inputs.',
  },
  {
    id: 'cmd-injection-php',
    title: 'Possible command injection (shell execution)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-78',
    exts: PHP,
    re: /\b(?:shell_exec|system|passthru|exec|popen|proc_open)\s*\(\s*[^)]*\$/,
    description: 'A shell command includes a variable. If it is user-controlled, attackers can run arbitrary commands.',
    recommendation: 'Avoid shell calls. If unavoidable, use escapeshellarg on every argument and an allow-list of commands.',
  },
  {
    id: 'pickle',
    title: 'Unsafe deserialization (pickle/marshal)',
    severity: 'high',
    category: 'Insecure Deserialization',
    cwe: 'CWE-502',
    exts: PY,
    re: /\bpickle\.loads?\(|\bmarshal\.loads?\(/,
    description: 'Loading pickled data from an untrusted source can run arbitrary code.',
    recommendation: 'Use a data-only format such as JSON, or sign and verify the data before loading it.',
  },
  {
    id: 'yaml-load',
    title: 'Unsafe YAML loading',
    severity: 'high',
    category: 'Insecure Deserialization',
    cwe: 'CWE-502',
    exts: PY,
    re: /\byaml\.load\(/,
    when: (line) => !/SafeLoader|safe_load/.test(line),
    description: 'yaml.load without a safe loader can construct arbitrary Python objects from untrusted input.',
    recommendation: 'Use yaml.safe_load.',
  },
  {
    id: 'unserialize',
    title: 'Unsafe deserialization (unserialize)',
    severity: 'high',
    category: 'Insecure Deserialization',
    cwe: 'CWE-502',
    exts: PHP,
    re: /\bunserialize\s*\(/,
    description: 'unserialize on untrusted data can trigger object injection and code execution.',
    recommendation: 'Use json_decode, or pass allowed_classes => false.',
  },
  {
    id: 'weak-hash',
    title: 'Weak hash algorithm (MD5/SHA-1)',
    severity: 'medium',
    category: 'Cryptography',
    cwe: 'CWE-327',
    re: /createHash\(\s*["'](?:md5|sha1)["']\s*\)|hashlib\.(?:md5|sha1)\(|MessageDigest\.getInstance\(\s*"(?:MD5|SHA-?1)"|\b(?:md5|sha1)\s*\(\s*\$\w*(?:pass|pwd)/i,
    description: 'MD5 and SHA-1 are broken for security purposes. They are unsafe for passwords, signatures and integrity checks.',
    recommendation: 'Use SHA-256 or better for integrity, and bcrypt, scrypt or Argon2 for passwords.',
  },
  {
    id: 'insecure-random',
    title: 'Predictable random numbers used for a security value',
    severity: 'medium',
    category: 'Cryptography',
    cwe: 'CWE-338',
    re: /Math\.random\(\)|\brandom\.(?:random|randint|choice|randrange)\(|\bmt_rand\(/,
    when: (line) => /token|secret|password|passwd|session|otp|nonce|csrf|reset|api[_-]?key/i.test(line),
    description: 'Math.random and similar generators are predictable, so values like tokens and reset codes can be guessed.',
    recommendation: 'Use crypto.randomBytes / crypto.randomUUID (Node), the secrets module (Python), or random_bytes (PHP).',
  },
  {
    id: 'tls-verify',
    title: 'TLS certificate verification disabled',
    severity: 'high',
    category: 'Transport Security',
    cwe: 'CWE-295',
    when: (line) => !/\bjwt\./i.test(line),
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|\bverify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)/,
    description: 'With certificate checks off, anyone on the network path can impersonate the server and read or change the traffic.',
    recommendation: 'Remove the override. If you use a private CA, add it to the trust store instead of disabling verification.',
  },
  {
    id: 'cors-wildcard',
    title: 'Overly permissive CORS policy',
    severity: 'medium',
    category: 'Configuration',
    cwe: 'CWE-942',
    re: /\borigin\s*:\s*["']\*["']|Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|\bcors\(\s*\)/,
    description: 'Any website can call this API from a visitor\'s browser, which makes cross-site abuse easier.',
    recommendation: 'Allow only your own front-end origins, for example cors({ origin: ["https://app.example.com"] }).',
  },
  {
    id: 'jwt-none',
    title: 'JWT "none" algorithm allowed',
    severity: 'high',
    category: 'Authentication',
    cwe: 'CWE-347',
    re: /algorithms?\s*:\s*(?:\[[^\]]*)?["']none["']/i,
    description: 'Accepting unsigned tokens lets anyone forge a login.',
    recommendation: 'Pin the algorithm (for example HS256 or RS256) and never accept "none".',
  },
  {
    id: 'xss',
    title: 'Possible cross-site scripting (unescaped HTML)',
    severity: 'medium',
    category: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    exts: new Set([...JS_HTML, 'php']),
    re: /\.innerHTML\s*=(?!=)|\.outerHTML\s*=(?!=)|\bdangerouslySetInnerHTML\b|\bdocument\.write\s*\(|\bv-html\b/,
    // Fixed text is harmless, and a line that is itself the inside of a string (a script embedded in a config value) is not code.
    when: (line) =>
      !/\.(?:innerHTML|outerHTML)\s*=\s*(["'`])(?:(?!\1)[^$+\\]|\\.)*\1\s*;?\s*(?:\/\/.*)?$/.test(line) &&
      !/\bdocument\.write\(\s*(["'`])(?:(?!\1)[^$+\\]|\\.)*\1\s*\)/.test(line) &&
      !/^\s*[`'"]/.test(line),
    description: 'Inserting raw HTML into the page lets attacker-controlled text run as script in a visitor\'s browser.',
    recommendation: 'Use textContent or framework escaping. If HTML is required, sanitize it first with a library such as DOMPurify.',
  },
  {
    id: 'path-traversal-js',
    title: 'Possible path traversal (file access from request data)',
    severity: 'high',
    category: 'Unsafe File Handling',
    cwe: 'CWE-22',
    exts: JS,
    re: /\b(?:readFile|readFileSync|createReadStream|sendFile|unlink|unlinkSync|writeFile|writeFileSync|rmSync)\s*\([^)]*\b(?:req|request)\.(?:params|query|body)\b/,
    description: 'A file path is taken from the request. Values like ../../etc/passwd can reach files outside the intended folder.',
    recommendation: 'Resolve the path and check it stays inside an allowed directory, or map user input to IDs instead of paths.',
  },
  {
    id: 'path-traversal-py',
    title: 'Possible path traversal (file access from request data)',
    severity: 'high',
    category: 'Unsafe File Handling',
    cwe: 'CWE-22',
    exts: PY,
    re: /\bopen\([^)]*\brequest\.(?:args|form|values|json|GET|POST)/,
    description: 'A file path comes from the request, so attackers may read or overwrite files outside the intended folder.',
    recommendation: 'Use werkzeug.utils.secure_filename or resolve and verify the final path stays inside an allowed directory.',
  },
  {
    id: 'php-include',
    title: 'Possible file inclusion from request data',
    severity: 'high',
    category: 'Unsafe File Handling',
    cwe: 'CWE-98',
    exts: PHP,
    re: /\b(?:include|require)(?:_once)?\s*\(?\s*[^;]*\$_(?:GET|POST|REQUEST)/,
    description: 'Including a file chosen by the request can lead to remote or local code execution.',
    recommendation: 'Never build include paths from user input. Use an allow-list of known pages.',
  },
  {
    id: 'open-redirect',
    title: 'Open redirect',
    severity: 'medium',
    category: 'Unvalidated Redirect',
    cwe: 'CWE-601',
    exts: JS,
    re: /\bres\.redirect\(\s*(?:req|request)\.(?:query|body|params)/,
    description: 'Redirecting to a user-supplied URL helps phishing, because the link starts on your trusted domain.',
    recommendation: 'Redirect only to relative paths or to URLs on an allow-list.',
  },
  {
    id: 'ssrf-js',
    title: 'Possible server-side request forgery',
    severity: 'high',
    category: 'SSRF',
    cwe: 'CWE-918',
    exts: JS,
    re: /\b(?:axios(?:\.\w+)?|fetch|got|needle|request)\s*\(\s*(?:req|request)\.(?:query|body|params)/,
    description: 'The server fetches a URL chosen by the user. Attackers can make it call internal services or cloud metadata endpoints.',
    recommendation: 'Validate against an allow-list of hosts, block private and link-local IP ranges, and disable redirects.',
  },
  {
    id: 'ssrf-py',
    title: 'Possible server-side request forgery',
    severity: 'high',
    category: 'SSRF',
    cwe: 'CWE-918',
    exts: PY,
    re: /\brequests\.(?:get|post|put|delete|head)\(\s*request\./,
    description: 'The server fetches a URL taken from the request, which can be abused to reach internal systems.',
    recommendation: 'Validate against an allow-list of hosts and block private IP ranges.',
  },
  {
    id: 'nosql-injection',
    title: 'Possible NoSQL injection',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-943',
    exts: JS,
    re: /\.(?:find|findOne|findOneAndUpdate|findOneAndDelete|updateOne|updateMany|deleteOne|deleteMany)\(\s*(?:req|request)\.(?:body|query)\s*[,)]/,
    description: 'The whole request body is used as a database query, so attackers can send operators like {"$ne": null} to bypass checks.',
    recommendation: 'Pick specific fields, cast them to the expected type (String, Number), and consider express-mongo-sanitize.',
  },
  {
    id: 'mass-assignment',
    title: 'Possible mass assignment',
    severity: 'medium',
    category: 'Broken Access Control',
    cwe: 'CWE-915',
    exts: JS,
    re: /\.(?:create|insertOne|insertMany|updateOne|findByIdAndUpdate)\(\s*(?:[\w$]+\s*,\s*)?(?:req|request)\.body\s*[,)]/,
    description: 'The whole request body is saved to the database, so users may set fields they should not, such as role or isAdmin.',
    recommendation: 'Copy only an allow-list of fields from the request body before saving.',
  },
  {
    id: 'debug-mode',
    title: 'Debug mode enabled',
    severity: 'medium',
    category: 'Configuration',
    cwe: 'CWE-489',
    exts: PY,
    re: /\bapp\.run\([^)]*debug\s*=\s*True|^\s*DEBUG\s*=\s*True\b/,
    description: 'Debug mode exposes an interactive console and detailed errors that can lead to code execution.',
    recommendation: 'Turn debug off outside local development and drive it from an environment variable.',
  },
  {
    id: 'stack-leak',
    title: 'Stack trace sent to the client',
    severity: 'medium',
    category: 'Information Disclosure',
    cwe: 'CWE-209',
    exts: JS,
    re: /\bres\.(?:json|send|status\([^)]*\)\.(?:json|send))\([^)]*\b(?:err|error|e)\.stack\b/,
    description: 'Stack traces reveal file paths, library versions and internal structure that help attackers.',
    recommendation: 'Return a generic message in production and log the details on the server only.',
  },
  {
    id: 'cookie-flags',
    title: 'Cookie security flag disabled',
    severity: 'medium',
    category: 'Session Management',
    cwe: 'CWE-1004',
    exts: JS,
    re: /\b(?:httpOnly|secure)\s*:\s*false\b/,
    description: 'Without HttpOnly and Secure, session cookies can be read by scripts or sent over plain HTTP.',
    recommendation: 'Set httpOnly: true and secure: true (in production), and a suitable sameSite value.',
  },
  {
    id: 'localstorage-token',
    title: 'Auth token stored in localStorage',
    severity: 'low',
    category: 'Sensitive Data Exposure',
    cwe: 'CWE-922',
    exts: JS,
    re: /localStorage\.setItem\(\s*["'](?:token|jwt|access_?token|auth\w*|session\w*)["']/i,
    description: 'Any script running on the page (for example through an XSS bug) can read tokens in localStorage.',
    recommendation: 'Prefer HttpOnly, Secure, SameSite cookies for session tokens, and keep your CSP strict.',
  },
  {
    id: 'xss-php',
    title: 'Possible cross-site scripting (request data written into HTML)',
    severity: 'high',
    category: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    exts: PHP,
    re: /<[a-z][^>]*|<\/[a-z]+>/i,
    when: (line, ctx) =>
      (/\becho\b|\bprint\b|\.=|\$(?:html|page|output)\b|<<</.test(line) || /<[a-z][^>]*["']\s*\.\s*\$/i.test(line)) &&
      ctx.taint.usesRhs(line) &&
      !/htmlspecialchars|htmlentities|strip_tags|intval|json_encode|mysqli|die\s*\(|error|header\s*\(/i.test(line),
    description: 'A value from the request is placed into the page without escaping, so an attacker can run script in a visitor\'s browser.',
    recommendation: 'Escape output with htmlspecialchars($value, ENT_QUOTES, "UTF-8") before it goes into HTML.',
  },
  {
    id: 'php-file-from-request',
    title: 'File path taken from the request (file inclusion or traversal)',
    severity: 'high',
    category: 'Unsafe File Handling',
    cwe: 'CWE-98',
    exts: PHP,
    re: /\$(?:file|page|path|include|template|module|view|lang|dir|filename)\w*\s*=\s*\$_(?:GET|POST|REQUEST)/i,
    description: 'A file or page name is read straight from the request. If it is later opened or included, attackers can read or run files they should not reach.',
    recommendation: 'Map user input to a fixed allow-list of pages or file IDs, and never build paths from raw input.',
  },
  {
    id: 'php-upload',
    title: 'Uploaded file saved to disk',
    severity: 'medium',
    category: 'Unsafe File Handling',
    cwe: 'CWE-434',
    exts: PHP,
    re: /\bmove_uploaded_file\s*\(/,
    description: 'Saving an upload is risky unless the type, size and name are checked. An uploaded script in a web folder can take over the server.',
    recommendation: 'Check the real content type, allow only expected extensions, generate your own file name and store uploads outside the web root.',
  },
  {
    id: 'open-redirect-php',
    title: 'Open redirect',
    severity: 'medium',
    category: 'Unvalidated Redirect',
    cwe: 'CWE-601',
    exts: PHP,
    re: /\bheader\s*\(\s*["']location:\s*["']\s*\.\s*\$/i,
    when: (line, ctx) => ctx.taint.uses(line),
    description: 'Redirecting to a user-supplied URL helps phishing, because the link starts on your trusted domain.',
    recommendation: 'Redirect only to relative paths or to URLs on an allow-list.',
  },
  {
    id: 'nosql-where',
    title: 'Possible NoSQL injection ($where runs JavaScript built from strings)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-943',
    exts: JS,
    re: /\$where\s*:\s*(?:`[^`]*\$\{|["'][^"']*["']\s*\+)/,
    description: 'A MongoDB $where query is a piece of JavaScript. Building it from strings lets crafted input run its own code inside the database.',
    recommendation: 'Do not use $where with user input. Use normal query operators, and cast values to the expected type first.',
  },
  {
    id: 'ssrf-variable',
    title: 'Possible server-side request forgery (URL comes from the request)',
    severity: 'high',
    category: 'SSRF',
    cwe: 'CWE-918',
    exts: JS,
    re: /\b(?:axios(?:\.\w+)?|fetch|got(?:\.\w+)?|needle(?:\.\w+)?|request|https?\.get)\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/,
    when: (_line, ctx, m) => ctx.taint.isTainted(m[1]),
    description: 'The server fetches a URL that came from the user. Attackers can make it call internal services or cloud metadata endpoints.',
    recommendation: 'Validate against an allow-list of hosts, block private and link-local IP ranges, and disable redirects.',
  },
  {
    id: 'redos',
    title: 'Regular expression that can hang the server (ReDoS)',
    severity: 'medium',
    category: 'Denial of Service',
    cwe: 'CWE-1333',
    exts: new Set([...JS, 'py', 'php']),
    re: /(?:=\s*\/|RegExp\(\s*["'`]|re\.compile\(\s*r?["']|preg_match\(\s*["']\/?).*\((?:[^()\\]|\\.)*[+*]\)+[+*{]/,
    description: 'A group that repeats inside another repeat makes some inputs take exponentially long to match, so one request can freeze the app.',
    recommendation: 'Rewrite the pattern without nested repeats, cap the input length before matching, or use a regex engine with linear-time matching.',
  },
  {
    id: 'cookie-no-flags',
    title: 'Cookie set without security flags',
    severity: 'medium',
    category: 'Session Management',
    cwe: 'CWE-1004',
    exts: JS,
    re: /\bres\.cookie\(\s*["'][^"']*(?:session|sid|token|auth|jwt)[^"']*["']\s*,\s*[^,)]+\)/i,
    description: 'This cookie looks like it holds a session or login, but it is set without httpOnly, secure or sameSite, so scripts can read it and it can travel over plain HTTP.',
    recommendation: 'Pass options: res.cookie(name, value, { httpOnly: true, secure: true, sameSite: "lax" }).',
  },
  {
    id: 'hardcoded-crypto-key',
    title: 'Hardcoded cryptographic key',
    severity: 'high',
    category: 'Cryptography',
    cwe: 'CWE-798',
    exts: JS,
    re: /\bcreate(?:Hmac|Cipheriv|Decipheriv)\(\s*["'][^"']+["']\s*,\s*["'][^"']{6,}["']/,
    description: 'The key used to sign or encrypt data is written in the code. Anyone who can read the code can forge signatures or decrypt the data.',
    recommendation: 'Load the key from an environment variable or secrets manager, and rotate it since it has been exposed.',
  },
  {
    id: 'dir-listing',
    title: 'Directory listing enabled',
    severity: 'medium',
    category: 'Configuration',
    cwe: 'CWE-548',
    exts: JS,
    re: /\bserveIndex\s*\(/,
    description: 'Visitors can browse the list of files in this folder, which often exposes backups, logs and internal files.',
    recommendation: 'Remove directory listing, or serve only the specific files that are meant to be public.',
  },
  {
    id: 'angular-bypass',
    title: 'Possible cross-site scripting (framework protection bypassed)',
    severity: 'high',
    category: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    exts: JS,
    re: /\.bypassSecurityTrust(?:Html|Script|Style|Url|ResourceUrl)\s*\(/,
    description: 'Angular escapes HTML automatically. This call switches that protection off for the value, so attacker-controlled text can run as script.',
    recommendation: 'Remove the bypass and let Angular sanitize the value. If raw HTML is truly needed, clean it with DOMPurify first.',
  },
  {
    id: 'secret-assign',
    title: 'Hardcoded credential',
    severity: 'high',
    category: 'Secrets',
    cwe: 'CWE-798',
    skipTests: true,
    re: /(?:secret|signing[_-]?key|private[_-]?key|hmac|jwt[_-]?key|session[_-]?key|encryption[_-]?key|api[_-]?key|auth[_-]?key)\w*["']?\]?\s*[:=]\s*["']([^"'\n]{6,})["']/i,
    when: (_line, _ctx, m) =>
      !PLACEHOLDER.test(m[1]) &&
      !/^\$/.test(m[1]) &&
      !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(m[1]) &&
      !/^(?:https?:|\/|\.)/.test(m[1]) &&
      (m[1].match(/ /g) || []).length <= 2,
    description: 'A secret key is written directly in the code, so anyone who can read the code can sign sessions or tokens as your app.',
    recommendation: 'Move the value to an environment variable or secrets manager, use a long random value, and rotate it since it has been exposed.',
  },
  {
    id: 'eval-tainted',
    title: 'Dynamic code execution (eval / new Function)',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-95',
    exts: JS,
    re: /\b(?:[\w$]+\.eval|math(?:js)?\.evaluate|vm\.(?:runInNewContext|runInThisContext|runInContext)|safeEval)\s*\(/,
    when: (line, ctx) => ctx.taint.usesRhs(line),
    description: 'A function that evaluates text as code is given a value from the request. Attackers can run their own code.',
    recommendation: 'Do not evaluate user input. Parse the expression with a safe parser that only supports the operations you need.',
  },
  {
    id: 'js-deserialize',
    title: 'Unsafe deserialization',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-502',
    exts: JS,
    re: /\b(?:serialize\.unserialize|node_serialize\.unserialize)\s*\(|\bunserialize\s*\(/,
    description: 'This library can run code hidden inside the data it is asked to load, so loading data from a user lets them take over the server.',
    recommendation: 'Use JSON.parse for data, and never deserialize input with libraries that can rebuild functions.',
  },
  {
    id: 'xxe',
    title: 'XML external entities enabled',
    severity: 'high',
    category: 'Injection',
    cwe: 'CWE-611',
    re: /\bnoent\s*:\s*true|\bresolve_entities\s*=\s*True|LIBXML_NOENT|external-general-entities["']?\s*,\s*true/i,
    description: 'The XML parser is told to load external entities, so a crafted XML file can read local files or call internal services.',
    recommendation: 'Turn entity expansion off (noent: false, resolve_entities=False) and reject DOCTYPE declarations in untrusted XML.',
  },
  {
    id: 'weak-hash-call',
    title: 'Weak hash algorithm (MD5/SHA-1)',
    severity: 'medium',
    category: 'Cryptography',
    cwe: 'CWE-327',
    exts: JS,
    re: /\b(?:md5|sha1)\s*\(/,
    when: (line) => /pass|pwd|token|secret|login|reset|session|auth|cred/i.test(line),
    description: 'MD5 and SHA-1 are broken for security purposes. A value derived from them can be guessed or forged.',
    recommendation: 'Use random tokens (crypto.randomBytes) for resets and sessions, and bcrypt, scrypt or Argon2 for passwords.',
  },
  {
    id: 'jwt-verify-off',
    title: 'JWT signature not checked',
    severity: 'high',
    category: 'Authentication',
    cwe: 'CWE-347',
    re: /\bjwt\.decode\([^)]*\bverify\s*=\s*False|verify_signature["']?\s*[:=]\s*False/i,
    description: 'The token is read without checking its signature, so anyone can forge a login by writing their own token.',
    recommendation: 'Always verify the signature with a secret or public key and a fixed algorithm list before trusting any claim in the token.',
  },
  {
    id: 'ssti',
    title: 'Possible template injection',
    severity: 'medium',
    category: 'Injection',
    cwe: 'CWE-1336',
    exts: PY,
    re: /\brender_template_string\(\s*(?!["'])[A-Za-z_]/,
    description: 'The page template is built as text at run time. If any request data is mixed into that text, an attacker can run code through the template engine.',
    recommendation: 'Keep template text fixed and pass user values as variables: render_template("page.html", name=value).',
  },
  {
    id: 'template-unescaped',
    title: 'Unescaped output in template (possible XSS)',
    severity: 'medium',
    category: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    exts: new Set(['ejs', 'hbs']),
    re: /<%-(?!\s*(?:include|partial|body|layout)\b)[^%]+%>|\{\{\{[^}]+\}\}\}/,
    description: 'This template prints the value without escaping it, so HTML or script inside the value runs in the visitor\'s browser.',
    recommendation: 'Use the escaping form (<%= value %> in EJS, {{value}} in Handlebars). Only print raw HTML that you have sanitized yourself.',
  },
  {
    id: 'xss-js-response',
    title: 'Possible cross-site scripting (request data written into the response)',
    severity: 'high',
    category: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    exts: JS,
    re: /\bres\.(?:send|write|end)\(.*<[a-z!/]/i,
    when: (line, ctx) => /["'`]\s*\+|\+\s*["'`]|\$\{/.test(line) && ctx.taint.usesRhs(line) && !/escape|sanitize|encodeURI|DOMPurify|xss\(/i.test(line),
    description: 'A value from the request is joined into the HTML that is sent back, so an attacker can run script in a visitor\'s browser.',
    recommendation: 'Escape the value before it goes into HTML (a template engine with auto-escaping, or an escape function), or send JSON instead of HTML.',
  },
  {
    id: 'open-redirect-var',
    title: 'Open redirect',
    severity: 'medium',
    category: 'Unvalidated Redirect',
    cwe: 'CWE-601',
    exts: JS,
    re: /\bres\.(?:redirect|location)\(\s*(?:\d+\s*,\s*)?(?:([A-Za-z_$][\w$]*)\s*\)|(?:req|request)\.(?:query|body|params))/,
    when: (_line, ctx, m) => (m[1] ? ctx.taint.isTainted(m[1]) : true),
    description: 'Redirecting to a user-supplied URL helps phishing, because the link starts on your trusted domain.',
    recommendation: 'Redirect only to relative paths or to URLs on an allow-list.',
  },
  {
    id: 'path-traversal-var',
    title: 'Possible path traversal (file access from request data)',
    severity: 'high',
    category: 'Unsafe File Handling',
    cwe: 'CWE-22',
    exts: JS,
    re: /\b(?:readFile|readFileSync|createReadStream|sendFile|unlink|unlinkSync|writeFile|writeFileSync|rmSync|appendFile)\s*\(([^)]*)/,
    when: (_line, ctx, m) => ctx.taint.usesRhs(m[1]) && !/\b(?:basename|normalize)\s*\(|\.startsWith\(/.test(m[1]),
    description: 'A file path includes a value from the request. Values like ../../etc/passwd can reach files outside the intended folder.',
    recommendation: 'Resolve the path and check it stays inside an allowed directory, or map user input to IDs instead of paths.',
  },
  {
    id: 'ssrf-helper',
    title: 'Possible server-side request forgery (URL comes from the request)',
    severity: 'medium',
    category: 'SSRF',
    cwe: 'CWE-918',
    exts: JS,
    re: /\b\w*(?:[Ff]etch|[Pp]roxy|[Dd]ownload|[Ww]ebhook)\w*\(\s*(?:req|request)\.(?:body|query|params)/,
    description: 'A helper that fetches a URL is called with a value from the request. Attackers can make the server call internal services or cloud metadata endpoints.',
    recommendation: 'Validate against an allow-list of hosts, block private and link-local IP ranges, and disable redirects.',
  },
  {
    id: 'prototype-pollution',
    title: 'Possible prototype pollution',
    severity: 'medium',
    category: 'Injection',
    cwe: 'CWE-1321',
    exts: JS,
    re: /\b(\w+)\[(\w+)\]\s*=\s*\w+\[\2\]\s*;?\s*$|\b(?:_|lodash)\.(?:merge|defaultsDeep|set)\(.*\b(?:req|request)\.(?:body|query|params)/,
    when: (line, ctx) => /_|lodash/.test(line.slice(0, 40)) || !/__proto__|hasOwnProperty|Object\.create\(null\)|Object\.hasOwn/.test(ctx.code),
    description: 'Keys from one object are copied into another without blocking "__proto__", so an attacker who controls the input can change behaviour for every object in the app.',
    recommendation: 'Skip "__proto__", "constructor" and "prototype" keys when merging, or use Object.create(null) targets and a maintained merge library.',
  },
  ...INFRA_RULES,
];

const isComment = (t) => t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--');

/** Deterministic pattern checks. Fast, free, and the same result every time. */
export function runStaticRules(sources) {
  const findings = [];

  for (const src of sources) {
    const env = isEnvFile(src.path);
    const isTest = TEST_PATH.test(src.path);
    const counts = new Map();
    const seenSecretLines = new Set();
    const taint = createTaint(src.ext);
    const kind = infraKind(src.path, src.content ?? src.lines.join('\n'));
    let inPre = false;
    const code = src.lines.filter((l) => !isComment(l.trimStart())).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n'); // no comments, so a note saying "__proto__" is not mistaken for a guard

    for (let i = 0; i < src.lines.length; i++) {
      const line = src.lines[i];
      if (line.length > 2000) continue; // minified or generated
      if (isComment(line.trimStart())) continue;
      if (DOC_EXTS.has(src.ext)) {
        // Text inside <pre> and <code> blocks on a documentation page is an example, not code that runs.
        const wasInPre = inPre;
        if (/<pre\b/i.test(line)) inPre = true;
        if (/<\/pre>/i.test(line)) inPre = false;
        if (wasInPre || /<code\b|&lt;|&gt;/.test(line) || /<pre\b/i.test(line)) continue;
      }

      for (const rule of RULES) {
        const scope = rule.scope || 'code';
        if (!(scope === 'any' || (scope === 'env' ? env : !env))) continue;
        if (rule.exts && !rule.exts.has(src.ext)) continue;
        if (rule.kinds && !rule.kinds.includes(kind)) continue;
        if (rule.skipTests && isTest) continue;

        const m = line.match(rule.re);
        if (!m) continue;
        if (rule.when && !rule.when(line, { isTest, path: src.path, ext: src.ext, taint, src, code, i, lines: src.lines, kind }, m)) continue;

        if (rule.category === 'Secrets') {
          if (seenSecretLines.has(i)) continue; // one secret finding per line
          seenSecretLines.add(i);
        }
        const n = counts.get(rule.id) || 0;
        if (n >= 5) continue; // avoid flooding the report with one repeated issue
        counts.set(rule.id, n + 1);

        findings.push({
          title: rule.title,
          ruleId: rule.id,
          severity: typeof rule.severity === 'function' ? rule.severity(line, m, { taint }) : rule.severity,
          category: rule.category,
          description: rule.description,
          file: src.path,
          line: i + 1,
          cwe: rule.cwe,
          recommendation: rule.recommendation,
          snippet: snippetAround(src.lines, i, env),
          source: 'rule',
        });
      }
      taint.learn(line);
    }
  }

  return findings;
}
