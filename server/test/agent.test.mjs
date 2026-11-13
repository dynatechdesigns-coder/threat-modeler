import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentScanner } from '../src/services/scanner/agent/index.js';
import { readZip } from '../src/utils/zipReader.js';
import { redactLine } from '../src/services/scanner/agent/staticRules.js';

// Built at runtime so no secret-looking text sits in the source (GitHub push protection would block it).
const FAKE_STRIPE = ['sk', 'live', '51H8abcdefghijklmnop1234'].join('_');
const dir = path.dirname(fileURLToPath(import.meta.url));
const zipBuf = fs.readFileSync(path.join(dir, 'fixtures', 'vulnerable-app.zip'));
const files = [{ originalName: 'vulnerable-app.zip', key: 'k', storage: 'local' }];
const readFile = async () => zipBuf;

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

function makeFetch(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.endsWith('/querybatch')) return ok({ results: [{ vulns: [{ id: 'GHSA-test-0001' }] }, {}] });
    if (url.includes('/vulns/')) {
      return ok({
        id: 'GHSA-test-0001',
        summary: 'Prototype Pollution in lodash',
        details: 'Versions before 4.17.21 are vulnerable.',
        aliases: ['CVE-2020-8203'],
        database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1321'] },
        affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
      });
    }
    if (url.includes('anthropic.com') && opts.body && JSON.parse(opts.body).tool_choice?.name === 'write_summary') {
      return ok({
        content: [
          { type: 'tool_use', name: 'write_summary', input: { summary: 'Plain AI summary.', priorities: [{ title: 'Remove exposed secrets', why: 'Anyone with the code can use them.', action: 'Rotate the keys and use environment variables.' }] } },
        ],
      });
    }
    if (url.includes('anthropic.com')) {
      return ok({
        content: [
          {
            type: 'tool_use',
            name: 'report_findings',
            input: {
              findings: [
                { title: 'Missing authentication on /calc', severity: 'high', category: 'Broken Access Control', cwe: 'CWE-306', file: 'src/server.js', line: 11, description: 'Anyone can call this endpoint.', recommendation: 'Require authentication.', confidence: 'high' },
                { title: 'Duplicate of the SQL rule', severity: 'critical', category: 'Injection', cwe: 'CWE-89', file: 'src/db.js', line: 5, description: 'dup', recommendation: 'dup', confidence: 'high' },
                { title: 'Invented file', severity: 'high', category: 'Injection', cwe: 'CWE-89', file: 'src/nope.js', line: 3, description: 'x', recommendation: 'x', confidence: 'high' },
                { title: 'Invented line', severity: 'high', category: 'Injection', cwe: 'CWE-89', file: 'src/server.js', line: 999, description: 'x', recommendation: 'x', confidence: 'high' },
                { title: 'Unsure guess', severity: 'medium', category: 'Other', cwe: 'CWE-20', file: 'src/server.js', line: 6, description: 'x', recommendation: 'x', confidence: 'low' },
              ],
            },
          },
        ],
      });
    }
    throw new Error(`unexpected url ${url}`);
  };
}

const baseConfig = { apiKey: 'test-key', model: 'test-model', maxChars: 150000, maxBatches: 4, osvEnabled: true };

test('zip reader extracts files and rejects garbage', () => {
  const { entries } = readZip(zipBuf);
  assert.ok(entries.some((e) => e.path === 'src/db.js'));
  assert.throws(() => readZip(Buffer.from('this is definitely not a zip archive at all')), /valid zip/);
});

test('static rules find the planted issues and skip node_modules', async () => {
  const calls = [];
  const { findings } = await createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false }, fetchImpl: makeFetch(calls) }).scan({ files, readFile });
  const has = (pred) => findings.some(pred);

  assert.ok(has((f) => f.file === 'src/db.js' && f.line === 5 && f.severity === 'critical' && f.cwe === 'CWE-89'), 'SQL injection');
  assert.ok(has((f) => f.file === 'src/server.js' && f.line === 12 && f.cwe === 'CWE-95'), 'eval');
  assert.ok(has((f) => f.file === 'src/server.js' && f.line === 7 && f.cwe === 'CWE-942'), 'CORS');
  assert.ok(has((f) => f.file === 'src/server.js' && f.line === 9 && f.cwe === 'CWE-798'), 'secret fallback');
  assert.ok(has((f) => f.file === 'src/server.js' && f.line === 16 && f.cwe === 'CWE-295'), 'TLS verify');
  assert.ok(has((f) => /AWS/.test(f.title) && f.line === 18), 'AWS key');
  assert.ok(has((f) => f.file === 'config/.env' && /Stripe/.test(f.title)), 'Stripe key in .env');
  assert.ok(has((f) => f.file === 'config/.env' && f.line === 2), 'password in .env');
  assert.ok(!has((f) => f.file.startsWith('node_modules')), 'node_modules ignored');
  assert.equal(calls.length, 0, 'no network calls without OSV or an API key');
});

test('secrets never appear in findings', async () => {
  const { findings } = await createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false }, fetchImpl: makeFetch([]) }).scan({ files, readFile });
  const blob = JSON.stringify(findings);
  for (const secret of ['IOSFODNN7EXAMPLE', 'hunter2hunter2', FAKE_STRIPE]) {
    assert.ok(!blob.includes(secret), `leaked ${secret}`);
  }
  assert.ok(blob.includes('REDACTED'));
});

test('redactLine masks provider keys, generic secrets and env values', () => {
  assert.ok(!redactLine('const k = "AKIAIOSFODNN7EXAMPLE";').includes('IOSFODNN7EXAMPLE'));
  assert.ok(!redactLine('password: "hunter2hunter2"').includes('hunter2hunter2'));
  assert.ok(!redactLine('DB_PASSWORD=hunter2hunter2', { env: true }).includes('hunter2hunter2'));
});

test('dependency check maps OSV advisories to findings', async () => {
  const { findings } = await createAgentScanner({ config: { ...baseConfig, apiKey: '' }, fetchImpl: makeFetch([]) }).scan({ files, readFile });
  const dep = findings.find((f) => f.source === 'osv');
  assert.ok(dep, 'dependency finding exists');
  assert.equal(dep.severity, 'high');
  assert.equal(dep.file, 'package.json');
  assert.match(dep.title, /lodash@4\.17\.15/);
  assert.match(dep.recommendation, /4\.17\.21/);
});

test('AI review keeps only verified findings and never sends secrets', async () => {
  const calls = [];
  const { findings, logs } = await createAgentScanner({ config: baseConfig, fetchImpl: makeFetch(calls) }).scan({ files, readFile });

  const ai = findings.filter((f) => f.source === 'ai');
  assert.equal(ai.length, 1, 'only the valid, non-duplicate finding is kept');
  assert.equal(ai[0].file, 'src/server.js');
  assert.equal(ai[0].line, 11);
  assert.match(ai[0].snippet, /app\.post/);

  const llm = calls.filter((c) => c.url.includes('anthropic.com') && c.body.tool_choice.name === 'report_findings');
  assert.equal(llm.length, 1);
  assert.equal(llm[0].opts.headers['x-api-key'], 'test-key');
  assert.equal(llm[0].body.model, 'test-model');
  assert.equal(llm[0].body.tool_choice.name, 'report_findings');
  const prompt = llm[0].body.messages[0].content;
  assert.ok(prompt.includes('<file path="src/db.js">'));
  for (const secret of ['IOSFODNN7EXAMPLE', 'hunter2hunter2', FAKE_STRIPE]) {
    assert.ok(!prompt.includes(secret), `secret ${secret} was sent to the AI`);
  }
  assert.ok(logs.some((l) => l.startsWith('[DONE]')));
});

test('AI failures do not fail the scan', async () => {
  const failing = async (url, opts) => {
    if (url.includes('anthropic.com')) return { ok: false, status: 401, text: async () => 'invalid x-api-key', json: async () => ({}) };
    return makeFetch([])(url, opts);
  };
  const { findings, logs } = await createAgentScanner({ config: baseConfig, fetchImpl: failing }).scan({ files, readFile });
  assert.ok(findings.length > 0);
  assert.ok(logs.some((l) => l.includes('AI review batch 1 failed')));
});

test('missing API key skips the AI layer with a clear message', async () => {
  const { logs } = await createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false }, fetchImpl: makeFetch([]) }).scan({ files, readFile });
  assert.ok(logs.some((l) => l.includes('AI review skipped')));
});

test('uploads with no code fail with a specific plain-words error', async () => {
  const scanner = createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false } });
  // Plain text: nothing scannable, so the report says what it saw, in plain words.
  await assert.rejects(
    () => scanner.scan({ files: [{ originalName: 'notes.txt', key: 'n', storage: 'local' }], readFile: async () => Buffer.from('hello') }),
    /could not find any code to review.*only \.txt files found/
  );
  // Media only: the report names the actual problem.
  await assert.rejects(
    () => scanner.scan({ files: [{ originalName: 'logo.png', key: 'm', storage: 'local' }], readFile: async () => Buffer.from('fakepng') }),
    /only photos, images, or media files/
  );
  // Deeply nested folders: the report tells the person to zip the inner files directly.
  // (One wrapper folder is normal for GitHub downloads, so it must not trigger this.)
  await assert.rejects(
    () => scanner.scan({ files: [{ originalName: 'project/src/notes.txt', key: 'z', storage: 'local' }], readFile: async () => Buffer.from('hello') }),
    /buried inside folders/
  );
});

test('generic secret rule ignores constant names but flags real-looking values', async () => {
  const scan = (code) =>
    createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false } }).scan({
      files: [{ originalName: 'a.js', key: 'a', storage: 'local' }],
      readFile: async () => Buffer.from(code),
    });
  const benign = await scan("export const TOKEN_KEY = 'tm_token';\nexport const placeholder = 'x';\n");
  assert.equal(benign.findings.filter((f) => f.category === 'Secrets').length, 0);
  const real = await scan("const apiKey = 'Zk3pQ9vL2xW8mN4bR7';\n");
  assert.equal(real.findings.filter((f) => f.category === 'Secrets').length, 1);
});

test('summary: AI writes the summary and sees titles only, never secrets or code', async () => {
  const calls = [];
  const { aiSummary } = await createAgentScanner({ config: baseConfig, fetchImpl: makeFetch(calls) }).scan({ files, readFile });
  assert.equal(aiSummary.source, 'ai');
  assert.equal(aiSummary.text, 'Plain AI summary.');
  assert.equal(aiSummary.priorities.length, 1);

  const call = calls.find((c) => c.body?.tool_choice?.name === 'write_summary');
  const prompt = call.body.messages[0].content;
  assert.match(prompt, /\[critical\]/);
  for (const secret of ['IOSFODNN7EXAMPLE', 'hunter2hunter2', FAKE_STRIPE, 'app.post']) {
    assert.ok(!prompt.includes(secret), `"${secret}" was sent in the summary prompt`);
  }
});

test('summary: without an AI key an automatic summary is still written', async () => {
  const { aiSummary, findings } = await createAgentScanner({ config: { ...baseConfig, apiKey: '', osvEnabled: false }, fetchImpl: makeFetch([]) }).scan({ files, readFile });
  assert.equal(aiSummary.source, 'rules');
  assert.match(aiSummary.text, new RegExp(`${findings.length} issue`));
  assert.ok(aiSummary.priorities.length > 0 && aiSummary.priorities.length <= 5);
  assert.ok(aiSummary.priorities.every((p) => p.title && p.action));
});

test('summary: a failed AI summary falls back and does not fail the scan', async () => {
  const base = makeFetch([]);
  const flaky = async (url, opts = {}) => {
    if (opts.body && JSON.parse(opts.body).tool_choice?.name === 'write_summary') {
      return { ok: false, status: 404, text: async () => 'model not found', json: async () => ({}) };
    }
    return base(url, opts);
  };
  const { aiSummary, logs } = await createAgentScanner({ config: baseConfig, fetchImpl: flaky }).scan({ files, readFile });
  assert.equal(aiSummary.source, 'rules');
  assert.ok(logs.some((l) => l.includes('AI summary failed')));
  assert.ok(logs.at(-1).startsWith('[DONE]'));
});

test('summary: an unreadable AI reply falls back', async () => {
  const base = makeFetch([]);
  const odd = async (url, opts = {}) => {
    if (opts.body && JSON.parse(opts.body).tool_choice?.name === 'write_summary') {
      return ok({ content: [{ type: 'tool_use', name: 'write_summary', input: { nope: true } }] });
    }
    return base(url, opts);
  };
  const { aiSummary } = await createAgentScanner({ config: baseConfig, fetchImpl: odd }).scan({ files, readFile });
  assert.equal(aiSummary.source, 'rules');
});

test('summary: a clean scan gets an honest "no issues" summary without an AI call', async () => {
  const calls = [];
  const { rulesSummary } = await import('../src/services/scanner/agent/aiSummary.js');
  const s = rulesSummary([]);
  assert.match(s.text, /no issues/);
  assert.match(s.text, /does not prove/);
  assert.equal(calls.length, 0);
});

test('timeout: a slow AI call fails fast with a clear message and the summary call is skipped', async () => {
  const calls = [];
  const base = makeFetch(calls);
  const hung = async (url, opts = {}) => {
    if (url.includes('anthropic.com')) {
      calls.push({ url, body: JSON.parse(opts.body) });
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }
    return base(url, opts);
  };
  const { logs, aiSummary, findings } = await createAgentScanner({ config: { ...baseConfig, timeoutSeconds: 30 }, fetchImpl: hung }).scan({ files, readFile });

  assert.ok(logs.some((l) => l.includes('did not answer within 30s')));
  assert.ok(logs.some((l) => l.includes('AI summary skipped')));
  assert.equal(calls.filter((c) => c.body?.tool_choice?.name === 'write_summary').length, 0, 'no second AI call after a failure');
  assert.equal(aiSummary.source, 'rules');
  assert.ok(findings.length > 0, 'scan still returns rule findings');
});
