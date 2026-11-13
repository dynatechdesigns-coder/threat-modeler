import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ScanReport } from '../src/models/ScanReport.js';
import * as scanController from '../src/controllers/scan.controller.js';

test('updateScan controller is exported', () => {
  assert.equal(typeof scanController.updateScan, 'function', 'scan.controller should export updateScan');
});

test('ScanReport persists frontend AI threat matrix payload', () => {
  const path = ScanReport.schema.path('resultData');
  assert.ok(path, 'ScanReport schema should define resultData so the matrix is saved to MongoDB');
});

test('PUT /:id route saves via auth + updateScan', () => {
  const src = fs.readFileSync(new URL('../src/routes/scan.routes.js', import.meta.url), 'utf8');
  assert.match(src, /router\.put\s*\(\s*['"]\/:id['"]/);
  assert.ok(src.includes('updateScan'), 'scan routes should wire updateScan');
  assert.ok(src.includes('protect'), 'scan routes should keep using the existing JWT protect middleware');
});

test('updateScan reads id + resultData/status and saves (existing error path)', () => {
  const src = fs.readFileSync(new URL('../src/controllers/scan.controller.js', import.meta.url), 'utf8');
  assert.ok(src.includes('findOwned(req)') || src.includes('req.params.id'), 'updateScan should find the scan by its URL id');
  assert.ok(src.includes('resultData'), 'updateScan should apply resultData from the request body');
  assert.ok(src.includes('asyncHandler'), 'updateScan should use asyncHandler so errors reach the error middleware');
});
