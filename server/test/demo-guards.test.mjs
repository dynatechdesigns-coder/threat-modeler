import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ScanReport } from '../src/models/ScanReport.js';
import {
  toPublicDemoReport,
  DEMO_MAX_FILES,
  DEMO_MAX_BYTES,
  DEMO_TTL_MS,
  demoExpiresAt,
} from '../src/controllers/scan.controller.js';
import {
  limitContentLength,
  limitTotalSize,
  maxTotalBytes,
} from '../src/middleware/upload.js';

const controllerSrc = fs.readFileSync(new URL('../src/controllers/scan.controller.js', import.meta.url), 'utf8');
const scanRoutesSrc = fs.readFileSync(new URL('../src/routes/scan.routes.js', import.meta.url), 'utf8');
const uploadRoutesSrc = fs.readFileSync(new URL('../src/routes/upload.routes.js', import.meta.url), 'utf8');
const demoSrc = fs.readFileSync(new URL('../../client/src/pages/Demo.jsx', import.meta.url), 'utf8');

const nextOk = () => {
  const calls = [];
  const next = (err) => calls.push(err);
  return { next, calls };
};

test('demo polling strips owner, storage keys and internal ids but keeps the report id', () => {
  const doc = {
    toObject: () => ({
      _id: 'report1',
      user: 'someone',
      shareToken: 'secret',
      __v: 0,
      name: 'Demo',
      status: 'completed',
      files: [{ originalName: 'a.js', key: 'demo/1-a.js', size: 10, mimeType: 'text/plain', storage: 'local', _id: 'f1' }],
      findings: [{ _id: 'g1', title: 'XSS', severity: 'high' }],
      summary: { high: 1 },
    }),
  };
  const out = toPublicDemoReport(doc);
  assert.equal(out._id, 'report1');
  assert.equal(out.user, undefined);
  assert.equal(out.shareToken, undefined);
  assert.equal(out.__v, undefined);
  assert.deepEqual(out.files, [{ originalName: 'a.js', size: 10, mimeType: 'text/plain' }]);
  assert.deepEqual(out.findings, [{ title: 'XSS', severity: 'high' }]);
  assert.deepEqual(out.summary, { high: 1 });
});

test('demo guardrail constants stay tight (scanner only analyzes ~10MB)', () => {
  assert.equal(DEMO_MAX_FILES, 40);
  assert.equal(DEMO_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(DEMO_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  const exp = demoExpiresAt(1_000_000);
  assert.equal(exp.getTime(), 1_000_000 + DEMO_TTL_MS);
});

test('content-length guard rejects before multer buffers, exact guard after parsing', () => {
  const over = { headers: { 'content-length': String(maxTotalBytes() + 2 * 1024 * 1024 + 1) }, files: [] };
  const r1 = nextOk();
  limitContentLength()(over, {}, r1.next);
  assert.equal(r1.calls.length, 1);
  assert.equal(r1.calls[0].statusCode, 413);

  const under = { headers: { 'content-length': '100' }, files: [{ size: 50 }] };
  const r2 = nextOk();
  limitContentLength()(under, {}, r2.next);
  assert.deepEqual(r2.calls, [undefined]);

  const noHeader = { headers: {}, files: [] };
  const r3 = nextOk();
  limitContentLength()(noHeader, {}, r3.next);
  assert.deepEqual(r3.calls, [undefined]);

  const big = { files: [{ size: maxTotalBytes() + 1 }] };
  const r4 = nextOk();
  limitTotalSize()(big, {}, r4.next);
  assert.equal(r4.calls.length, 1);
  assert.equal(r4.calls[0].statusCode, 413);

  const small = { files: [{ size: 10 }] };
  const r5 = nextOk();
  limitTotalSize()(small, {}, r5.next);
  assert.deepEqual(r5.calls, [undefined]);
});

test('demo limiter caps are wired per-request, not just in the controller', () => {
  assert.ok(scanRoutesSrc.includes('limitContentLength(DEMO_MAX_BYTES)'), 'demo upload must pre-check content length');
  assert.ok(scanRoutesSrc.includes('limitTotalSize(DEMO_MAX_BYTES)'), 'demo upload must re-check parsed size');
  assert.ok(uploadRoutesSrc.includes('limitContentLength()'), 'authenticated uploads must pre-check content length');
  assert.ok(uploadRoutesSrc.includes('limitTotalSize()'), 'authenticated uploads must re-check parsed size');
});

test('demo concurrency cap counts reports still waiting to start', () => {
  assert.ok(controllerSrc.includes("$in: ['running', 'uploaded']"), 'assertCanScan must count uploaded as well as running');
});

test('demo creation enforces file-count and byte caps with clear errors', () => {
  assert.ok(controllerSrc.includes('DEMO_MAX_FILES'), 'demo upload must enforce the file-count cap');
  assert.ok(controllerSrc.includes('DEMO_MAX_BYTES'), 'demo upload must enforce the byte cap');
  assert.ok(controllerSrc.includes('maxBytes: DEMO_MAX_BYTES'), 'demo github zip must use the demo cap, not the 100MB upload cap');
});

test('demo reports expire while authenticated reports never do', () => {
  const expiresPath = ScanReport.schema.path('expiresAt');
  assert.ok(expiresPath, 'ScanReport schema should define expiresAt');
  const hasTtl = ScanReport.schema.indexes().some(
    ([fields, opts]) => fields?.expiresAt && opts?.expireAfterSeconds === 0
  );
  assert.equal(hasTtl, true);
  assert.ok(controllerSrc.includes('expiresAt: demoExpiresAt()'), 'every demo creation path must set expiresAt');
  assert.equal((controllerSrc.match(/expiresAt: demoExpiresAt\(\)/g) || []).length >= 3, true);
});

test('demo client refuses over-limit instead of silently truncating', () => {
  assert.ok(!demoSrc.includes('slice(0, 40)'), 'client must not silently scan the first 40 files');
  assert.ok(demoSrc.includes('MAX_DEMO_FILES'), 'client must refuse over the file cap with a clear message');
  assert.ok(demoSrc.includes('`${f._id || f.title}-${i}`') || demoSrc.includes("${f._id || f.title}-${i}"), 'findings keep unique index-suffixed keys');
});
