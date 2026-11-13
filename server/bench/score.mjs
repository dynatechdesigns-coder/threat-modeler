// Usage: node bench/score.mjs   Scans the benchmark apps and scores the rules against bench/truth.json.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadSources } from '../src/services/scanner/agent/fileLoader.js';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';

const ROOT = process.env.BENCH_DIR;
const truth = JSON.parse(readFileSync(new URL('./truth.json', import.meta.url), 'utf8'));
const KIND_RULES = {
  'code-exec': ['eval', 'eval-tainted', 'exec-py', 'cmd-injection-js', 'cmd-injection-php', 'cmd-injection-py'],
  'cmd-injection': ['cmd-injection-js', 'cmd-injection-py', 'cmd-injection-php', 'eval'],
  'sql-injection': ['sql-injection'],
  'nosql-injection': ['nosql-injection', 'nosql-where'],
  'open-redirect': ['open-redirect', 'open-redirect-php', 'open-redirect-var'],
  redirect: ['open-redirect', 'open-redirect-php', 'open-redirect-var'],
  ssrf: ['ssrf-js', 'ssrf-py', 'ssrf-variable', 'ssrf-helper'],
  redos: ['redos'],
  secret: ['generic-secret', 'secret-private-key', 'hardcoded-crypto-key', 'env-secret', 'secret-assign'],
  cookie: ['cookie-no-flags', 'cookie-flags'],
  xss: ['xss', 'xss-php', 'xss-js-response', 'angular-bypass', 'template-unescaped'],
  'file-inclusion': ['php-include', 'php-file-from-request', 'path-traversal-js', 'path-traversal-py', 'path-traversal-var'],
  upload: ['php-upload'],
  'weak-hash': ['weak-hash', 'weak-hash-call'],
  cors: ['cors-wildcard'],
  'dir-listing': ['dir-listing'],
  deserialization: ['pickle', 'yaml-load', 'unserialize', 'js-deserialize'],
  xxe: ['xxe'],
  jwt: ['jwt-verify-off', 'jwt-none'],
  ssti: ['ssti'],
};
const WINDOW = 2; // a finding counts if it is within this many lines of the known bug
const triage = JSON.parse(readFileSync(new URL('./triage.json', import.meta.url), 'utf8'));
const NOISE = new Set(triage.noise); const RISKY = new Set(triage.risky);
const out = { apps: {}, total: { known: 0, caught: 0, findings: 0 } };
const verbose = process.argv.includes('-v');

const ONLY = process.env.ONLY; for (const app of Object.keys(truth)) { if (ONLY && app !== ONLY) continue;
  const dir = join(ROOT, app);
  if (!existsSync(dir)) { console.error(`missing ${dir}`); continue; }
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      if (n === '.git' || n === 'node_modules') continue;
      const p = join(d, n);
      statSync(p).isDirectory() ? walk(p) : files.push({ key: p, originalName: relative(dir, p).replace(/\\/g, '/') });
    }
  })(dir);
  const { sources } = await loadSources({ files, readFile: async (k) => readFileSync(k) });
  const findings = runStaticRules(sources);
  const used = new Set();
  const rows = [];

  for (const t of truth[app]) {
    const text = readFileSync(join(dir, t.file), 'utf8').split(/\r?\n/);
    const re = new RegExp(t.line);
    const lines = text.map((l, i) => (re.test(l) ? i + 1 : 0)).filter(Boolean);
    if (!lines.length) throw new Error(`truth entry ${t.id}: pattern not found in ${t.file}`);
    const okRules = KIND_RULES[t.kind] || [];
    const hits = findings.filter((f) => f.file === t.file && okRules.includes(f.ruleId) && lines.some((l) => Math.abs(f.line - l) <= WINDOW));
    hits.forEach((h) => used.add(h));
    rows.push({ ...t, caught: hits.length > 0, by: hits[0]?.title });
  }
  const caught = rows.filter((r) => r.caught).length;
  const extra = findings.filter((f) => !used.has(f));
  const verdict = (f) => (NOISE.has(`${app}:${f.file}:${f.line}`) ? 'noise' : RISKY.has(`${app}:${f.file}:${f.line}`) ? 'risky' : 'real');
  const v = { real: 0, risky: 0, noise: 0 };
  for (const f of findings) v[verdict(f)] += 1;
  for (const k of [...NOISE, ...RISKY]) if (k.startsWith(app + ':') && !findings.some((f) => `${app}:${f.file}:${f.line}` === k)) console.error('triage entry no longer matches a finding: ' + k);
  out.apps[app] = { verdicts: v, known: rows.length, caught, findings: findings.length, extra: extra.length, rows, extraList: extra.map((f) => `${f.severity[0]} ${f.file}:${f.line} ${f.title}`) };
  out.total.known += rows.length; out.total.caught += caught; out.total.findings += findings.length; out.total.real = (out.total.real||0)+v.real; out.total.risky = (out.total.risky||0)+v.risky; out.total.noise = (out.total.noise||0)+v.noise;
}

for (const [app, r] of Object.entries(out.apps)) {
  console.log(`\n${app}: caught ${r.caught} of ${r.known} known bugs; ${r.findings} findings: ${r.verdicts.real} real, ${r.verdicts.risky} risky-but-unproven, ${r.verdicts.noise} noise`);
  for (const row of r.rows) console.log(`  ${row.caught ? 'CAUGHT' : 'missed'}  ${row.id} ${row.kind}: ${row.note}${row.by ? '  <- ' + row.by : ''}`);
  if (verbose) for (const l of r.extraList) console.log('   extra: ' + l);
}
console.log(`\nTOTAL: caught ${out.total.caught} of ${out.total.known} known bugs (${Math.round((100*out.total.caught)/out.total.known)}%). ${out.total.findings} findings: ${out.total.real} real, ${out.total.risky} risky, ${out.total.noise} noise (${Math.round((100*out.total.noise)/out.total.findings)}% noise)`);
