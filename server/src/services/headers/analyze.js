// Grades the security headers of a web page. Pure function: it gets the headers that were received and returns checks.
// No network in here, so it is easy to test.

const WEIGHTS = { https: 20, hsts: 15, csp: 20, framing: 10, nosniff: 8, referrer: 7, permissions: 5, cookies: 10, leaks: 5 };
const POINTS = { pass: 1, warn: 0.5, fail: 0 };

const SIX_MONTHS = 15552000;

const ENGINE_FIX = {
  hsts: `# nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

// Express
import helmet from 'helmet';
app.use(helmet());   // sets this and several other headers`,
  csp: `# nginx (start strict, then allow what your site needs)
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'" always;

// Express
app.use(helmet.contentSecurityPolicy({ directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"] } }));`,
  framing: `# nginx
add_header X-Frame-Options "DENY" always;     # or SAMEORIGIN if you frame your own pages

// Express
app.use(helmet.frameguard({ action: 'deny' }));`,
  nosniff: `# nginx
add_header X-Content-Type-Options "nosniff" always;

// Express
app.use(helmet.noSniff());`,
  referrer: `# nginx
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

// Express
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));`,
  permissions: `# nginx
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

// Express
app.use((req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); next(); });`,
  cookies: `// Express
res.cookie('session', value, { httpOnly: true, secure: true, sameSite: 'lax' });

# PHP
setcookie('session', $value, ['httponly' => true, 'secure' => true, 'samesite' => 'Lax']);`,
  leaks: `# nginx
server_tokens off;

// Express
app.disable('x-powered-by');   // helmet does this for you`,
  https: `Serve the whole site over HTTPS and redirect every http:// address to https://.
Most hosts (Vercel, Netlify, Cloudflare) do this with one switch. On nginx: return 301 https://$host$request_uri;`,
};

const first = (v) => (Array.isArray(v) ? v[0] : v);
const parseCsp = (value) => {
  const out = {};
  for (const part of String(value || '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = sources;
  }
  return out;
};

function checkHttps({ startUrl, finalUrl }) {
  const final = new URL(finalUrl);
  if (final.protocol === 'https:') {
    return { status: 'pass', detail: new URL(startUrl).protocol === 'http:' ? 'The http address redirects to https.' : 'The page is served over HTTPS.' };
  }
  return { status: 'fail', detail: 'The page is served over plain HTTP, so anything sent to it can be read or changed on the way.' };
}

function checkHsts(h, isHttps) {
  const v = first(h['strict-transport-security']);
  if (!isHttps) return { status: 'fail', detail: 'HSTS only works over HTTPS.' };
  if (!v) return { status: 'fail', detail: 'Missing. Browsers can be tricked into using plain HTTP the first time they visit.' };
  const age = Number(/max-age=(\d+)/i.exec(v)?.[1]);
  if (!Number.isFinite(age)) return { status: 'warn', detail: `The header has no valid max-age: ${v}` };
  if (age < SIX_MONTHS) return { status: 'warn', detail: `max-age is ${age} seconds. At least 6 months (${SIX_MONTHS}) is recommended.` };
  return { status: 'pass', detail: `max-age is ${age} seconds${/includeSubDomains/i.test(v) ? ', and it covers subdomains' : ''}.` };
}

function checkCsp(h) {
  const enforced = first(h['content-security-policy']);
  const reportOnly = first(h['content-security-policy-report-only']);
  if (!enforced) {
    return reportOnly
      ? { status: 'warn', detail: 'Only a report-only policy is set, which watches but does not block anything.' }
      : { status: 'fail', detail: 'Missing. A Content-Security-Policy is the strongest protection against cross-site scripting.' };
  }
  const csp = parseCsp(enforced);
  const script = csp['script-src'] || csp['default-src'];
  if (!script) return { status: 'warn', detail: 'The policy sets no script-src or default-src, so scripts are not restricted.' };
  const problems = [];
  if (script.includes("'unsafe-inline'")) problems.push("allows 'unsafe-inline' scripts");
  if (script.includes("'unsafe-eval'")) problems.push("allows 'unsafe-eval'");
  if (script.includes('*') || script.includes('http:') || script.includes('data:')) problems.push('allows scripts from any address');
  if (problems.length) return { status: 'warn', detail: `A policy is set, but it ${problems.join(' and ')}.` };
  return { status: 'pass', detail: 'A policy is set and scripts are restricted.' };
}

function checkFraming(h) {
  const xfo = String(first(h['x-frame-options']) || '').toUpperCase().trim();
  const fa = parseCsp(first(h['content-security-policy']))['frame-ancestors'];
  if (fa) return { status: 'pass', detail: `frame-ancestors is set (${fa.join(' ') || 'none'}).` };
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return { status: 'pass', detail: `X-Frame-Options is ${xfo}.` };
  if (xfo) return { status: 'warn', detail: `X-Frame-Options "${xfo}" is obsolete or unclear. Use DENY, SAMEORIGIN or frame-ancestors.` };
  return { status: 'fail', detail: 'Missing. Other sites can show this page inside a hidden frame to trick visitors into clicking (clickjacking).' };
}

function checkNosniff(h) {
  return String(first(h['x-content-type-options']) || '').toLowerCase().trim() === 'nosniff'
    ? { status: 'pass', detail: 'Set to nosniff.' }
    : { status: 'fail', detail: 'Missing. Browsers may guess a file type and run an upload as a script.' };
}

function checkReferrer(h) {
  const v = String(first(h['referrer-policy']) || '').toLowerCase().trim();
  if (!v) return { status: 'warn', detail: 'Missing. Browsers use their own default, which can leak full page addresses to other sites.' };
  if (v.includes('unsafe-url')) return { status: 'warn', detail: 'unsafe-url sends the full address, even to other sites.' };
  return { status: 'pass', detail: `Set to ${v}.` };
}

function checkPermissions(h) {
  return first(h['permissions-policy']) || first(h['feature-policy'])
    ? { status: 'pass', detail: 'A Permissions-Policy is set.' }
    : { status: 'warn', detail: 'Missing. It lets you switch off browser features you do not use, like the camera or location.' };
}

function checkCookies(setCookies, isHttps) {
  const list = [].concat(setCookies || []);
  if (!list.length) return { status: 'pass', detail: 'This page sets no cookies.' };

  const issues = [];
  let serious = false;
  for (const raw of list) {
    const name = raw.split('=')[0].trim();
    const attrs = raw.toLowerCase();
    const missing = [];
    if (isHttps && !/;\s*secure/.test(attrs)) missing.push('Secure');
    if (!/;\s*httponly/.test(attrs)) missing.push('HttpOnly');
    if (!/;\s*samesite=/.test(attrs)) missing.push('SameSite');
    if (missing.length) {
      issues.push(`${name} is missing ${missing.join(', ')}`);
      if (/(sess|sid|token|auth|jwt|login)/i.test(name) && missing.some((m) => m !== 'SameSite')) serious = true;
    }
  }
  if (!issues.length) return { status: 'pass', detail: `${list.length} cookie${list.length === 1 ? '' : 's'} set with the protective flags.` };
  return { status: serious ? 'fail' : 'warn', detail: `${issues.slice(0, 4).join('. ')}.` };
}

function checkLeaks(h) {
  const found = [];
  const server = first(h.server);
  if (server && /\d/.test(server)) found.push(`Server: ${server}`);
  for (const name of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version']) {
    if (h[name]) found.push(`${name}: ${first(h[name])}`);
  }
  return found.length
    ? { status: 'warn', detail: `The page reveals software details (${found.join(', ')}) that help attackers pick known exploits.` }
    : { status: 'pass', detail: 'No software versions are revealed.' };
}

function checkCors(h) {
  const origin = first(h['access-control-allow-origin']);
  if (!origin) return null;
  if (origin === '*' && String(first(h['access-control-allow-credentials'])).toLowerCase() === 'true') {
    return { status: 'fail', detail: 'Allows every site and credentials together. Allow only your own addresses.' };
  }
  return { status: 'pass', detail: origin === '*' ? 'Any site can read this response. Fine for public data, risky for private data.' : `Only ${origin} is allowed.` };
}

const gradeOf = (score) => (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F');

/** headers: lowercase names. Set-Cookie may be an array. */
export function analyzeHeaders({ startUrl, finalUrl, status, headers, redirects = [] }) {
  const h = headers || {};
  const isHttps = new URL(finalUrl).protocol === 'https:';

  const rows = [
    ['https', 'Uses HTTPS', checkHttps({ startUrl, finalUrl })],
    ['hsts', 'HSTS (Strict-Transport-Security)', checkHsts(h, isHttps)],
    ['csp', 'Content-Security-Policy', checkCsp(h)],
    ['framing', 'Clickjacking protection', checkFraming(h)],
    ['nosniff', 'X-Content-Type-Options', checkNosniff(h)],
    ['referrer', 'Referrer-Policy', checkReferrer(h)],
    ['permissions', 'Permissions-Policy', checkPermissions(h)],
    ['cookies', 'Cookie flags', checkCookies(h['set-cookie'], isHttps)],
    ['leaks', 'Software details hidden', checkLeaks(h)],
  ];

  let score = 0;
  const checks = rows.map(([id, title, r]) => {
    score += WEIGHTS[id] * POINTS[r.status];
    return { id, title, status: r.status, detail: r.detail, fix: r.status === 'pass' ? '' : ENGINE_FIX[id] };
  });

  const cors = checkCors(h);
  if (cors) checks.push({ id: 'cors', title: 'CORS policy', status: cors.status, detail: cors.detail, fix: cors.status === 'pass' ? '' : "app.use(cors({ origin: ['https://your-site.com'], credentials: true }));" });
  if (cors?.status === 'fail') score = Math.max(0, score - 10);

  score = Math.round(score);
  let grade = gradeOf(score);
  if (!isHttps) grade = 'F'; // nothing else matters much without HTTPS

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status] += 1;

  return { startUrl, finalUrl, status, redirects, score, grade, checks, summary };
}
