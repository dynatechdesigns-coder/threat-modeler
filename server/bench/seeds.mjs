// Scores the rules against Vulnerable-Node's own labelled seed files (sast/seeds + sast/ground-truth.yaml).
// Usage: BENCH_DIR=<folder holding vnode/> node bench/seeds.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';

const dir = join(process.env.BENCH_DIR, 'vnode/sast');
const expected = [...readFileSync(join(dir, 'ground-truth.yaml'), 'utf8').matchAll(/- file: (\S+)\s+cwe: (\S+)/g)].map((m) => ({ file: m[1], cwe: m[2] }));
const seeds = readdirSync(join(dir, 'seeds')).filter((f) => f.endsWith('.js'));
const sources = seeds.map((f) => {
  const content = readFileSync(join(dir, 'seeds', f), 'utf8');
  return { path: f, ext: 'js', content, lines: content.split(/\r?\n/) };
});
const findings = runStaticRules(sources);
let tp = 0;
for (const e of expected) {
  const hits = findings.filter((f) => f.file === e.file);
  if (hits.length) tp++;
  console.log(`${hits.length ? 'CAUGHT' : 'missed'}  ${e.file} (${e.cwe})${hits.length ? '  <- ' + hits[0].title : ''}`);
}
const clean = seeds.filter((s) => s.startsWith('clean-'));
let fp = 0;
for (const c of clean) {
  const hits = findings.filter((f) => f.file === c);
  fp += hits.length;
  console.log(`${hits.length ? 'FALSE ALARM' : 'clean ok '}  ${c}${hits.length ? ': ' + hits.map((h) => h.title).join('; ') : ''}`);
}
console.log(`\ncaught ${tp} of ${expected.length}; false alarms on clean decoys: ${fp}`);
