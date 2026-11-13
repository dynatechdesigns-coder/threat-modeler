import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ScanReport } from '../src/models/ScanReport.js';
import * as scanController from '../src/controllers/scan.controller.js';
import * as rateLimits from '../src/middleware/rateLimits.js';

const routesSrc = fs.readFileSync(new URL('../src/routes/scan.routes.js', import.meta.url), 'utf8');
const controllerSrc = fs.readFileSync(new URL('../src/controllers/scan.controller.js', import.meta.url), 'utf8');

test('judge demo: report owner is optional so anonymous scans can persist', () => {
  const userPath = ScanReport.schema.path('user');
  assert.ok(userPath, 'ScanReport schema should still define user');
  assert.equal(userPath.isRequired, false, 'user must be optional for account-free demo reports');
});

test('judge demo: POST /demo and GET /demo/:id are public (registered before protect)', () => {
  const demoPost = routesSrc.indexOf("router.post('/demo'");
  const demoGet = routesSrc.indexOf("router.get('/demo/:id'");
  const guard = routesSrc.indexOf('router.use(protect)');
  assert.ok(demoPost !== -1 && demoGet !== -1, 'scan routes should expose the public demo endpoints');
  assert.ok(guard !== -1, 'scan routes should still protect everything else');
  assert.ok(demoPost < guard && demoGet < guard, 'demo endpoints must be registered before router.use(protect)');
  assert.ok(routesSrc.includes('demoLimiter'), 'public demo endpoints should use the per-IP demoLimiter');
  assert.ok(routesSrc.includes('getDemoScan'), 'scan routes should wire getDemoScan');
});

test('judge demo: controller supports visitors without an account', () => {
  assert.equal(typeof scanController.scanDemo, 'function', 'scanDemo should stay exported');
  assert.equal(typeof scanController.getDemoScan, 'function', 'getDemoScan should be exported');
  assert.ok(controllerSrc.includes('user?._id'), 'demo scan should tolerate a missing user');
  assert.ok(controllerSrc.includes('delete out.user'), 'public demo polling must strip the owner id');
  assert.ok(controllerSrc.includes("'origin.kind': 'demo'"), 'public polling must be scoped to demo-origin reports');
});

test('judge demo: anonymous scans are capped globally instead of per quota', () => {
  assert.equal(typeof rateLimits.demoLimiter, 'function', 'demoLimiter should be exported');
  assert.ok(controllerSrc.includes('if (!user)'), 'assertCanScan should branch for anonymous visitors');
});

test('judge demo: visitors can scan their own code without an account', () => {
  const uploadRoute = routesSrc.indexOf("router.post('/demo/upload'");
  const guard = routesSrc.indexOf('router.use(protect)');
  assert.ok(uploadRoute !== -1, 'scan routes should expose the public demo upload endpoint');
  assert.ok(uploadRoute < guard, 'demo upload must be registered before router.use(protect)');
  assert.ok(routesSrc.includes('scanDemoUpload'), 'scan routes should wire scanDemoUpload');
  assert.equal(typeof scanController.scanDemoUpload, 'function', 'scanDemoUpload should be exported');
  assert.ok(controllerSrc.includes('req.files'), 'demo upload should read multipart files');
  assert.ok(controllerSrc.includes("'origin.kind': 'demo'"), 'demo uploads should be scoped as demo-origin reports');
});

test('judge demo: status polling has its own generous cap so it never 429s mid-scan', () => {
  assert.equal(typeof rateLimits.demoPollLimiter, 'function', 'demoPollLimiter should be exported');
  assert.ok(routesSrc.includes("router.get('/demo/:id', demoPollLimiter,"), 'polling must use demoPollLimiter, not the 10/hour creation cap');
  assert.ok(!routesSrc.includes("router.get('/demo/:id', demoLimiter,"), 'polling must not share the scan-creation limiter');
});

test('judge demo: scan runner tolerates ownerless reports', () => {
  const runnerSrc = fs.readFileSync(new URL('../src/services/scanRunner.js', import.meta.url), 'utf8');
  assert.ok(runnerSrc.includes('report.user ?'), 'scan runner should guard the owner lookup for demo reports');
});
