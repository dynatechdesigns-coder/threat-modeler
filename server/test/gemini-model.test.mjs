import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(
  path.join(dir, '..', 'src', 'services', 'scanner', 'agent', 'llmProviders.js'),
  'utf8'
);

test('Gemini SDK default model is gemini-4-hydrogen', () => {
  assert.ok(
    src.includes("const model = genAI.getGenerativeModel({ model: 'gemini-4-hydrogen' });"),
    'llmProviders.js must declare the gemini-4-hydrogen SDK model'
  );
});

test('llmProviders module loads with the Gemini SDK installed', async () => {
  const mod = await import('../src/services/scanner/agent/llmProviders.js');
  assert.ok(mod.PROVIDERS.includes('gemini'));
});
