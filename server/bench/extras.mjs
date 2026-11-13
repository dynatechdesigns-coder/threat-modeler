import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadSources } from '../src/services/scanner/agent/fileLoader.js';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';
const [root, app] = [process.env.BENCH_DIR, process.argv[2]];
const dir = join(root, app); const files = [];
(function walk(d){for(const n of readdirSync(d)){if(n==='.git'||n==='node_modules')continue;const p=join(d,n);statSync(p).isDirectory()?walk(p):files.push({key:p,originalName:relative(dir,p).replace(/\\/g,'/')});}})(dir);
// 1. Extract smartError along with sources
const { sources, smartError } = await loadSources({ files, readFile: async (k) => readFileSync(k) });

// 2. Add this block to throw the smart error if no code is found
if (sources.length === 0) {
  throw new Error(smartError || "No scannable source files found.");
}

// 3. Keep your existing static rules loop
for (const f of runStaticRules(sources)) {
  const line = sources.find((s) => s.path === f.file).lines[f.line - 1].trim().slice(0, 95);
  console.log(`${f.ruleId}\t${f.file.replace('vulnerabilities/','')}:${f.line}\t${line}`);
}