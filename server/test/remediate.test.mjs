import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRemediationPatch } from '../src/services/remediation.js';
import * as scanController from '../src/controllers/scan.controller.js';

const routesSrc = fs.readFileSync(new URL('../src/routes/scan.routes.js', import.meta.url), 'utf8');

const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
const geminiReply = (args) => ok({ candidates: [{ content: { parts: [{ functionCall: { name: 'return_patch', args } }] } }] });

const finding = {
  title: 'Possible SQL injection (query built from strings)',
  severity: 'critical',
  file: 'src/db.js',
  line: 5,
  cwe: 'CWE-89',
  description: 'User input flows into a query string.',
  recommendation: 'Use parameterized queries.',
  snippet: "db.query('SELECT * FROM users WHERE id = ' + req.params.id)",
};

test('remediation returns the Gemini-written patch and explanation', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return geminiReply({ patchedCode: 'db.query("SELECT * FROM users WHERE id = ?", [req.params.id])', explanation: 'Parameterized the query.' });
  };
  const out = await getRemediationPatch({ finding, apiKey: 'g-key', model: 'gemini-2.0-flash', fetchImpl });
  assert.equal(out.patchedCode, 'db.query("SELECT * FROM users WHERE id = ?", [req.params.id])');
  assert.equal(out.explanation, 'Parameterized the query.');
  assert.ok(calls[0].url.includes('generativelanguage.googleapis.com'), 'remediation uses the Gemini API');
  assert.ok(calls[0].body.systemInstruction.parts[0].text.includes('untrusted data'), 'snippet is framed as untrusted data');
});

test('remediation fails clearly without a key, without a snippet, or with an unreadable reply', async () => {
  await assert.rejects(
    getRemediationPatch({ finding, apiKey: '', model: 'm', fetchImpl: async () => { throw new Error('must not call'); } }),
    /GEMINI_API_KEY/
  );
  await assert.rejects(
    getRemediationPatch({ finding: { ...finding, snippet: '  ' }, apiKey: 'k', model: 'm', fetchImpl: async () => { throw new Error('must not call'); } }),
    /No code context/
  );
  await assert.rejects(
    getRemediationPatch({ finding, apiKey: 'k', model: 'm', fetchImpl: async () => ok({ candidates: [] }) }),
    /did not return a patch/
  );
});

test('remediation endpoint is authenticated, rate-limited and owner-scoped', () => {
  assert.equal(typeof scanController.remediateFinding, 'function', 'remediateFinding should be exported');
  const line = routesSrc.indexOf("router.post('/:id/remediate'");
  const guard = routesSrc.indexOf('router.use(protect)');
  assert.ok(line !== -1, 'scan routes should expose POST /:id/remediate');
  assert.ok(line > guard, 'remediate must be registered after protect (signed-in owners only)');
  assert.ok(routesSrc.includes("router.post('/:id/remediate', scanLimiter,"), 'remediation burns AI budget, so it shares the scanLimiter');
  const controllerSrc = fs.readFileSync(new URL('../src/controllers/scan.controller.js', import.meta.url), 'utf8');
  assert.ok(controllerSrc.includes('findOwned(req)'), 'remediation must be scoped to the report owner');
  assert.ok(controllerSrc.includes("report.findings.id(findingId)"), 'remediation must resolve the finding inside the owned report');
});
