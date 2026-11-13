import fs from 'node:fs';
import * as m from './src/config/env.js';
import { createAgentScanner } from './src/services/scanner/agent/index.js';

const env = m.env || m.default;
const zip = fs.readFileSync('./test/fixtures/vulnerable-app.zip');
const { logs, findings } = await createAgentScanner({
  config: { ...env.ai, osvEnabled: false },
  fetchImpl: fetch,
}).scan({
  files: [{ originalName: 'vulnerable-app.zip', key: 'k', storage: 'local' }],
  readFile: async () => zip,
});

console.log(logs.join('\n'));
console.log('AI findings:', findings.filter((f) => f.source === 'ai').length);