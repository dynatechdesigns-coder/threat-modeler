import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCAN = new URL('../../action/scan.mjs', import.meta.url).pathname;
const hasZip = spawnSync('zip', ['-v']).status === 0;
const TOKEN = 'tm_' + 'a'.repeat(43);

// A stand-in for the server: records what the action sends and answers with a scripted result.
function mockServer(result, { uploadStatus = 202 } = {}) {
  const seen = { uploads: [], polls: 0, comments: [], ghStatus: 200, existing: false };
  const server = http.createServer((req, res) => {
    // A stand-in for the GitHub API (pull request comments).
    if (req.url.startsWith('/repos/')) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const json = (code, obj) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(obj));
        if (req.headers.authorization !== 'Bearer ghs_test') return json(401, {});
        if (seen.ghStatus !== 200) return json(seen.ghStatus, { message: 'no' });
        if (req.method === 'GET') return json(200, seen.existing ? [{ id: 77, body: '<!-- threat-modeler-comment -->\nold' }] : []);
        seen.comments.push({ method: req.method, url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()).body });
        return json(req.method === 'POST' ? 201 : 200, {});
      });
      return;
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'bad token' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/ci/scan') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('latin1');
        seen.uploads.push({ role: /name="role"\r\n\r\n(\w+)/.exec(body)?.[1], project: /name="project"\r\n\r\n([^\r]+)/.exec(body)?.[1], isZip: body.includes('PK') });
        res.writeHead(uploadStatus, { 'content-type': 'application/json' }).end(JSON.stringify(uploadStatus === 202 ? { id: 'abc123', status: 'running' } : { message: 'nope' }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/ci/scans/abc123') {
      seen.polls += 1;
      const body = seen.polls < 2 ? { status: 'running' } : result;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'abc123', ...body }));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

function runAction(url, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-action-'));
  writeFileSync(join(dir, 'app.js'), 'console.log("hello");\n');
  const out = join(dir, 'output.txt');
  const summary = join(dir, 'summary.md');
  writeFileSync(out, '');
  writeFileSync(summary, '');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCAN], {
      cwd: dir,
      env: { PATH: process.env.PATH, INPUT_TOKEN: TOKEN, INPUT_API_URL: url, INPUT_PATH: dir, GITHUB_REPOSITORY: 'me/app', GITHUB_SHA: 'abcdef1234567', TM_POLL_MS: '20', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary, ...extra },
    });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stdout += d));
    child.on('close', (code) => resolve({ code, stdout, outputs: readFileSync(out, 'utf8'), summary: readFileSync(summary, 'utf8') }));
  });
}

const clean = { status: 'completed', riskScore: 20, baseline: false, summary: { critical: 0, high: 1, medium: 0, low: 0, total: 1 }, newCount: 0, newSevere: 0, fixedCount: 0, scoreChange: 0, newFindings: [], reportUrl: 'https://app.example/reports/abc123' };
const bad = { ...clean, riskScore: 60, newCount: 1, newSevere: 1, scoreChange: 40, newFindings: [{ severity: 'critical', title: 'SQL injection', file: 'db.js', line: 7, cwe: 'CWE-89' }] };

test('passes when the change adds nothing serious', { skip: !hasZip }, async () => {
  const m = await mockServer(clean);
  const r = await runAction(m.url, { GITHUB_EVENT_NAME: 'pull_request' });
  m.server.close();
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(m.seen.uploads, [{ role: 'pr', project: 'me/app', isZip: true }]);
  assert.match(r.outputs, /risk-score=20/);
  assert.match(r.summary, /passed/);
});

test('fails the build on a new critical problem and annotates the file', { skip: !hasZip }, async () => {
  const m = await mockServer(bad);
  const r = await runAction(m.url, { GITHUB_EVENT_NAME: 'pull_request' });
  m.server.close();
  assert.equal(r.code, 1);
  assert.match(r.stdout, /::error file=db\.js,line=7::critical: SQL injection/);
  assert.match(r.summary, /failed/);
  assert.match(r.outputs, /new-severe=1/);
});

test('"never" reports but does not fail', { skip: !hasZip }, async () => {
  const m = await mockServer(bad);
  const r = await runAction(m.url, { INPUT_FAIL_ON: 'never' });
  m.server.close();
  assert.equal(r.code, 0);
});

test('"new-any" fails on a new medium problem; "new-severe" does not', { skip: !hasZip }, async () => {
  const medium = { ...clean, newCount: 1, newSevere: 0, newFindings: [{ severity: 'medium', title: 'x', file: 'a.js', line: 1, cwe: '' }] };
  for (const [mode, code] of [['new-any', 1], ['new-severe', 0]]) {
    const m = await mockServer(medium);
    const r = await runAction(m.url, { INPUT_FAIL_ON: mode });
    m.server.close();
    assert.equal(r.code, code, mode);
  }
});

test('the first scan of a project (no baseline) never fails on "new" modes', { skip: !hasZip }, async () => {
  const m = await mockServer({ ...bad, baseline: true, newCount: 0, newSevere: 0, newFindings: [] });
  const r = await runAction(m.url);
  m.server.close();
  assert.equal(r.code, 0);
  assert.match(r.summary, /first scan/);
});

test('"severe" fails on any critical or high problem even without new ones', { skip: !hasZip }, async () => {
  const m = await mockServer(clean); // has 1 high
  const r = await runAction(m.url, { INPUT_FAIL_ON: 'severe' });
  m.server.close();
  assert.equal(r.code, 1);
});

test('a push to the default branch is sent as the baseline', { skip: !hasZip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tm-ev-'));
  const ev = join(dir, 'event.json');
  writeFileSync(ev, JSON.stringify({ repository: { default_branch: 'main' } }));
  const m = await mockServer(clean);
  await runAction(m.url, { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_PATH: ev });
  m.server.close();
  assert.equal(m.seen.uploads[0].role, 'baseline');
});

test('a wrong token or a refused upload fails clearly', { skip: !hasZip }, async () => {
  const m = await mockServer(clean);
  const r = await runAction(m.url, { INPUT_TOKEN: 'tm_' + 'b'.repeat(43) });
  m.server.close();
  assert.equal(r.code, 1);
  assert.match(r.stdout, /refused the upload \(401\)/);
});

test('missing settings fail before anything is uploaded', async () => {
  const r = spawnSync(process.execPath, [SCAN], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No API token/);
});

const prEvent = () => {
  const p = join(mkdtempSync(join(tmpdir(), 'tm-event-')), 'event.json');
  writeFileSync(p, JSON.stringify({ pull_request: { number: 5 } }));
  return p;
};
const withGh = (m, extra = {}) => ({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: prEvent(), GITHUB_API_URL: m.url, INPUT_GITHUB_TOKEN: 'ghs_test', ...extra });

test('posts one comment on a pull request, cleaned of mentions and html', { skip: !hasZip }, async () => {
  const evil = { ...bad, newFindings: [{ severity: 'high', title: 'Hi @victim <img src=x onerror=1> a|b', file: 'src/`x`.js', line: 3 }] };
  const m = await mockServer(evil);
  const r = await runAction(m.url, withGh(m));
  m.server.close();
  assert.equal(r.code, 1, 'the build still fails on the problem');
  assert.equal(m.seen.comments.length, 1);
  const c = m.seen.comments[0];
  assert.equal(c.method, 'POST');
  assert.match(c.url, /\/repos\/me\/app\/issues\/5\/comments$/);
  assert.ok(c.body.startsWith('<!-- threat-modeler-comment -->'));
  assert.match(c.body, /failed/);
  assert.ok(!c.body.includes('@victim'), 'mention defused');
  assert.ok(!c.body.includes('<img'), 'html removed');
});

test('edits the earlier comment instead of adding another', { skip: !hasZip }, async () => {
  const m = await mockServer(clean);
  m.seen.existing = true;
  const r = await runAction(m.url, withGh(m));
  m.server.close();
  assert.equal(r.code, 0, r.stdout);
  assert.equal(m.seen.comments.length, 1);
  assert.equal(m.seen.comments[0].method, 'PATCH');
  assert.match(m.seen.comments[0].url, /issues\/comments\/77$/);
});

test('no comment on a push, or when comment is false', { skip: !hasZip }, async () => {
  const a = await mockServer(clean);
  await runAction(a.url, withGh(a, { GITHUB_EVENT_NAME: 'push' }));
  a.server.close();
  assert.equal(a.seen.comments.length, 0);
  const b = await mockServer(clean);
  await runAction(b.url, withGh(b, { INPUT_COMMENT: 'false' }));
  b.server.close();
  assert.equal(b.seen.comments.length, 0);
});

test('a refused comment (read-only token) warns but never changes the result', { skip: !hasZip }, async () => {
  const m = await mockServer(clean);
  m.seen.ghStatus = 403;
  const r = await runAction(m.url, withGh(m));
  m.server.close();
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /::warning::Could not post the pull request comment/);
});
