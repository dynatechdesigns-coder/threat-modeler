import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanReport } from '../src/models/ScanReport.js';
import { createAgentScanner } from '../src/services/scanner/agent/index.js';
import { publicReport } from '../src/services/share.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const zipBuf = fs.readFileSync(path.join(dir, 'fixtures', 'vulnerable-app.zip'));
const files = [{ originalName: 'vulnerable-app.zip', key: 'k', storage: 'local' }];
const readFile = async () => zipBuf;
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

const analyzerSrc = fs.readFileSync(new URL('../src/services/scanner/agent/llmAnalyzer.js', import.meta.url), 'utf8');

// Stub: AI review returns the given findings, summary call returns a summary.
const router = (reviewFindings) => async (url, opts = {}) => {
  const body = JSON.parse(opts.body);
  if (JSON.stringify(body).includes('write_summary')) {
    return ok({ choices: [{ message: { tool_calls: [{ function: { name: 'write_summary', arguments: JSON.stringify({ summary: 'S', priorities: [] }) } }] } }] });
  }
  return ok({ choices: [{ message: { tool_calls: [{ function: { name: 'report_findings', arguments: JSON.stringify({ findings: reviewFindings }) } }] } }] });
};

const cfg = { provider: 'openai', apiKey: 'k', model: 'm', osvEnabled: false, maxChars: 150000, maxBatches: 4 };
const validFinding = {
  title: 'Missing authentication on /calc', severity: 'high', category: 'Broken Access Control',
  cwe: 'CWE-306', file: 'src/server.js', line: 11, description: 'Anyone can call this.',
  recommendation: 'Require auth.', confidence: 'high',
};

test('findings persist compliance tags end to end', () => {
  const tagsPath = ScanReport.schema.path('findings').schema.path('compliance_tags');
  assert.ok(tagsPath, 'finding schema should define compliance_tags');
  assert.equal(tagsPath.instance, 'Array');
  assert.ok(analyzerSrc.includes('compliance_tags'), 'LLM tool schema should request compliance_tags');
  assert.ok(analyzerSrc.includes('OWASP-A01:2021') && analyzerSrc.includes('SOC2-CC6.1'), 'prompt should name the OWASP and SOC 2 formats');
});

test('AI compliance tags survive the scanner, missing tags default to empty', async () => {
  const withTags = { ...validFinding, compliance_tags: ['OWASP-A01:2021', 'SOC2-CC6.1', '  ', 42] };
  const { findings } = await createAgentScanner({ config: cfg, fetchImpl: router([withTags]) })
    .scan({ files, readFile, ai: true });
  const ai = findings.filter((f) => f.source === 'ai');
  assert.equal(ai.length, 1);
  assert.deepEqual(ai[0].compliance_tags, ['OWASP-A01:2021', 'SOC2-CC6.1', '42']);

  const withoutTags = { ...validFinding };
  delete withoutTags.compliance_tags;
  const res2 = await createAgentScanner({ config: cfg, fetchImpl: router([withoutTags]) })
    .scan({ files, readFile, ai: true });
  assert.deepEqual(res2.findings.filter((f) => f.source === 'ai')[0].compliance_tags, []);
});

test('public shared reports include compliance tags (non-sensitive metadata)', () => {
  const out = publicReport({ name: 'x', findings: [{ _id: 'F1', compliance_tags: ['OWASP-A01:2021'] }] });
  assert.deepEqual(out.findings[0].compliance_tags, ['OWASP-A01:2021']);
  const missing = publicReport({ name: 'x', findings: [{ _id: 'F1' }] });
  assert.deepEqual(missing.findings[0].compliance_tags, []);
});
