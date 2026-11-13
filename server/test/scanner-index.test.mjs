import test from 'node:test';
import assert from 'node:assert/strict';

// Guards the Render startup crash: scanRunner imports { getScanner } from the
// scanner index, which must resolve every split helper under ./agent/ with an
// explicit .js extension (Node ESM has no extension searching). Before the fix
// this import threw ERR_MODULE_NOT_FOUND for ./llmAnalyzer.js, and getScanner
// did not exist at all.
test('scanner index resolves and provides the getScanner provider switch', async () => {
  const mod = await import('../src/services/scanner/index.js');
  assert.equal(typeof mod.getScanner, 'function', 'getScanner is exported');

  const scanner = mod.getScanner();
  assert.equal(typeof scanner?.scan, 'function', 'selected provider has a scan() method');
  assert.ok(['agent', 'mock'].includes(scanner.name), `known provider name, got ${scanner?.name}`);
});
