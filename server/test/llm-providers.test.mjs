import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentScanner } from '../src/services/scanner/agent/index.js';

// Built at runtime so no secret-looking text sits in the source (GitHub push protection would block it).
const FAKE_STRIPE = ['sk', 'live', '51H8abcdefghijklmnop1234'].join('_');
const dir = path.dirname(fileURLToPath(import.meta.url));
const zipBuf = fs.readFileSync(path.join(dir, 'fixtures', 'vulnerable-app.zip'));
const files = [{ originalName: 'vulnerable-app.zip', key: 'k', storage: 'local' }];
const readFile = async () => zipBuf;
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

// One valid finding, plus ones that must be rejected (duplicate of a rule, invented file, invented line, low confidence).
const AI_FINDINGS = [
  { title: 'Missing authentication on /calc', severity: 'high', category: 'Broken Access Control', cwe: 'CWE-306', file: 'src/server.js', line: 11, description: 'Anyone can call this.', recommendation: 'Require auth.', confidence: 'high' },
  { title: 'Duplicate of SQL rule', severity: 'critical', category: 'Injection', cwe: 'CWE-89', file: 'src/db.js', line: 5, description: 'dup', recommendation: 'dup', confidence: 'high' },
  { title: 'Invented file', severity: 'high', category: 'Injection', cwe: 'CWE-89', file: 'src/nope.js', line: 3, description: 'x', recommendation: 'x', confidence: 'high' },
  { title: 'Invented line', severity: 'high', category: 'Injection', cwe: 'CWE-89', file: 'src/server.js', line: 999, description: 'x', recommendation: 'x', confidence: 'high' },
  { title: 'Unsure guess', severity: 'medium', category: 'Other', cwe: 'CWE-20', file: 'src/server.js', line: 6, description: 'x', recommendation: 'x', confidence: 'low' },
];

const SECRETS = ['IOSFODNN7EXAMPLE', 'hunter2hunter2', FAKE_STRIPE];

function router(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const summaryCall = JSON.stringify(opts.body || '').includes('write_summary');
    if (summaryCall && url.endsWith('/chat/completions')) {
      return ok({ choices: [{ message: { tool_calls: [{ function: { name: 'write_summary', arguments: JSON.stringify({ summary: 'S', priorities: [] }) } }] } }] });
    }
    if (summaryCall && url.includes('generativelanguage.googleapis.com')) {
      return ok({ candidates: [{ content: { parts: [{ functionCall: { name: 'write_summary', args: { summary: 'S', priorities: [] } } }] } }] });
    }
    if (url.endsWith('/chat/completions')) {
      return ok({ choices: [{ message: { tool_calls: [{ function: { name: 'report_findings', arguments: JSON.stringify({ findings: AI_FINDINGS }) } }] } }] });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return ok({ candidates: [{ content: { parts: [{ functionCall: { name: 'report_findings', args: { findings: AI_FINDINGS } } }] } }] });
    }
    throw new Error(`unexpected url ${url}`);
  };
}

const cfg = (extra) => ({ osvEnabled: false, maxChars: 150000, maxBatches: 4, ...extra });

test('OpenAI provider: request format, verified findings, no secrets sent', async () => {
  const calls = [];
  const { findings } = await createAgentScanner({ config: cfg({ provider: 'openai', apiKey: 'oa-key', model: 'my-model' }), fetchImpl: router(calls) }).scan({ files, readFile });

  assert.equal(calls.length, 2); // one review call + one summary call
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer oa-key');
  assert.equal(calls[0].body.model, 'my-model');
  assert.equal(calls[0].body.tool_choice.function.name, 'report_findings');

  const prompt = calls[0].body.messages[1].content;
  assert.ok(prompt.includes('<file path="src/db.js">'));
  for (const s of SECRETS) assert.ok(!prompt.includes(s), `secret ${s} was sent`);

  const ai = findings.filter((f) => f.source === 'ai');
  assert.equal(ai.length, 1);
  assert.equal(ai[0].line, 11);
});

test('OpenAI-compatible base URL (OpenRouter, Groq, Ollama...) is used', async () => {
  const calls = [];
  await createAgentScanner({ config: cfg({ provider: 'openai', apiKey: 'k', model: 'm', baseUrl: 'https://openrouter.ai/api/v1/' }), fetchImpl: router(calls) }).scan({ files, readFile });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
});

test('Gemini provider: request format, verified findings, no secrets sent', async () => {
  const calls = [];
  const { findings } = await createAgentScanner({ config: cfg({ provider: 'gemini', apiKey: 'g-key', model: 'my-gemini' }), fetchImpl: router(calls) }).scan({ files, readFile });

  assert.equal(calls.length, 2); // one review call + one summary call
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/my-gemini:generateContent');
  assert.equal(calls[0].opts.headers['x-goog-api-key'], 'g-key');
  assert.deepEqual(calls[0].body.toolConfig.functionCallingConfig.allowedFunctionNames, ['report_findings']);

  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.ok(prompt.includes('<file path="src/server.js">'));
  for (const s of SECRETS) assert.ok(!prompt.includes(s), `secret ${s} was sent`);

  assert.equal(findings.filter((f) => f.source === 'ai').length, 1);
});

test('OpenAI and Gemini need an explicit model name', async () => {
  const calls = [];
  const { logs, findings } = await createAgentScanner({ config: cfg({ provider: 'openai', apiKey: 'k', model: '' }), fetchImpl: router(calls) }).scan({ files, readFile });
  assert.equal(calls.length, 0);
  assert.ok(logs.some((l) => l.includes('AI_MODEL')));
  assert.ok(findings.length > 0, 'rule findings still returned');
});

test('unknown provider is reported but does not fail the scan', async () => {
  const { logs, findings } = await createAgentScanner({ config: cfg({ provider: 'mystery', apiKey: 'k', model: 'm' }), fetchImpl: router([]) }).scan({ files, readFile });
  assert.ok(logs.some((l) => l.includes('Unknown AI provider')));
  assert.ok(findings.length > 0);
});
