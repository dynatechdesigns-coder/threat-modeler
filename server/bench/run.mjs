// Usage: node bench/run.mjs <dir> [--tests]   Runs the static rules (no network, no AI) over a folder and prints JSON.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadSources } from '../src/services/scanner/agent/fileLoader.js';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';

const root = process.argv[2];
const includeTests = process.argv.includes('--tests');
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (n === '.git' || n === 'node_modules') continue;
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else files.push({ key: p, originalName: relative(root, p).replace(/\\/g, '/') });
  }
})(root);

const { sources, stats } = await loadSources({ files, readFile: async (k) => readFileSync(k), includeTests });
const findings = runStaticRules(sources);
console.log(JSON.stringify({ scannedFiles: sources.length, stats, findings }, null, 1));
