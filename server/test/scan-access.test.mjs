import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ScanReport } from '../src/models/ScanReport.js';
import {
  updateScan,
  getScan,
  deleteScan,
  getDemoScan,
} from '../src/controllers/scan.controller.js';

const controllerSrc = fs.readFileSync(new URL('../src/controllers/scan.controller.js', import.meta.url), 'utf8');
const scanRoutesSrc = fs.readFileSync(new URL('../src/routes/scan.routes.js', import.meta.url), 'utf8');

// The handlers reach the database only through ScanReport.findOne, so these
// tests replace that one static with an in-memory stand-in. No database needed.
const realFindOne = ScanReport.findOne;
const restore = () => {
  ScanReport.findOne = realFindOne;
};

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const run = async (handler, req) => {
  const res = mockRes();
  const errors = [];
  await handler(req, res, (err) => errors.push(err));
  return { res, errors };
};

const ownedDoc = ({ owner = 'user-A', shared = false } = {}) => {
  const doc = {
    _id: 'report-1',
    user: owner,
    status: 'uploaded',
    shareToken: shared ? 'share-token-value' : undefined,
    resultData: undefined,
    files: [],
    saved: false,
    deleted: false,
    save: async () => {
      doc.saved = true;
    },
    deleteOne: async () => {
      doc.deleted = true;
    },
  };
  return doc;
};

// Only the owner sees their report: every other user gets "not found", never the report.
const ownerOnlyFindOne = (doc) => async (filter) => {
  if (filter && filter.user && String(filter.user) !== String(doc.user)) return null;
  return doc;
};

test('updateScan no longer references the undefined Scan model', () => {
  assert.equal(controllerSrc.includes('Scan.findById'), false, 'updateScan must not call Scan.findById');
  assert.ok(controllerSrc.includes('findOwned(req)'), 'updateScan must go through the ownership check');
  assert.ok(controllerSrc.includes('asyncHandler'), 'updateScan must use asyncHandler');
});

test('updateScan: the owner can save status and result data', async () => {
  const doc = ownedDoc();
  ScanReport.findOne = ownerOnlyFindOne(doc);
  try {
    const { res, errors } = await run(updateScan, {
      params: { id: 'report-1' },
      user: { _id: 'user-A' },
      body: { status: 'completed', resultData: { matrix: [1] } },
    });
    assert.deepEqual(errors, []);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(doc.status, 'completed');
    assert.deepEqual(doc.resultData, { matrix: [1] });
    assert.equal(doc.saved, true);
  } finally {
    restore();
  }
});

test('updateScan: user B cannot update user A report (404, nothing saved)', async () => {
  const doc = ownedDoc();
  ScanReport.findOne = ownerOnlyFindOne(doc);
  try {
    const { res, errors } = await run(updateScan, {
      params: { id: 'report-1' },
      user: { _id: 'user-B' },
      body: { status: 'completed', resultData: { matrix: [1] } },
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
    assert.equal(doc.saved, false);
    assert.equal(res.body, undefined);
  } finally {
    restore();
  }
});

test('updateScan: an invalid status is rejected before any report is touched', async () => {
  let lookedUp = false;
  ScanReport.findOne = async () => {
    lookedUp = true;
    return null;
  };
  try {
    const { errors } = await run(updateScan, {
      params: { id: 'report-1' },
      user: { _id: 'user-A' },
      body: { status: 'published' },
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 400);
    assert.equal(lookedUp, false);
  } finally {
    restore();
  }
});

test('updateScan: result data is refused on a shared report, status still saves', async () => {
  const doc = ownedDoc({ shared: true });
  ScanReport.findOne = ownerOnlyFindOne(doc);
  try {
    const { errors } = await run(updateScan, {
      params: { id: 'report-1' },
      user: { _id: 'user-A' },
      body: { status: 'completed', resultData: { matrix: [1] } },
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 403);
    assert.equal(doc.saved, false);
  } finally {
    restore();
  }
});

test('getScan: user B cannot read user A report', async () => {
  const doc = ownedDoc();
  ScanReport.findOne = ownerOnlyFindOne(doc);
  try {
    const { res, errors } = await run(getScan, { params: { id: 'report-1' }, user: { _id: 'user-B' } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
    assert.equal(res.body, undefined);
  } finally {
    restore();
  }
});

test('deleteScan: user B cannot delete user A report', async () => {
  const doc = ownedDoc();
  ScanReport.findOne = ownerOnlyFindOne(doc);
  try {
    const { errors } = await run(deleteScan, { params: { id: 'report-1' }, user: { _id: 'user-B' } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
    assert.equal(doc.deleted, false);
  } finally {
    restore();
  }
});

test('getDemoScan: an anonymous visitor cannot reach a private (non-demo) report', async () => {
  ScanReport.findOne = async () => null; // what the database returns for a non-demo id
  try {
    const { res, errors } = await run(getDemoScan, { params: { id: 'private-report-id' } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
    assert.equal(res.body, undefined);
  } finally {
    restore();
  }
  assert.ok(
    controllerSrc.includes("'origin.kind': 'demo'"),
    'getDemoScan must constrain the lookup to demo-origin reports'
  );
});

test('getDemoScan: a demo report is returned stripped of owner and storage identifiers', async () => {
  const demoDoc = {
    toObject: () => ({
      _id: 'demo-1',
      user: 'user-A',
      shareToken: 'share-token-value',
      __v: 0,
      name: 'Demo',
      status: 'completed',
      origin: { kind: 'demo' },
      files: [{ originalName: 'a.js', key: 'demo/1-a.js', size: 10, mimeType: 'text/plain', storage: 'r2' }],
      findings: [{ _id: 'g1', title: 'XSS', severity: 'high' }],
      summary: { high: 1 },
    }),
  };
  ScanReport.findOne = async () => demoDoc;
  try {
    const { res, errors } = await run(getDemoScan, { params: { id: 'demo-1' } });
    assert.deepEqual(errors, []);
    assert.equal(res.statusCode, 200);
    const json = JSON.stringify(res.body.report);
    for (const leaked of ['user-A', 'share-token-value', 'demo/1-a.js', 'storage', '__v']) {
      assert.equal(json.includes(leaked), false, `demo response leaked ${leaked}`);
    }
    assert.equal(res.body.report._id, 'demo-1');
  } finally {
    restore();
  }
});

test('scan routes keep every report endpoint behind authentication except the public demo ones', () => {
  const authed = ['listScans', 'getScan', 'updateScan', 'triggerScan', 'deleteScan', 'rescan', 'enableShare', 'disableShare', 'remediateFinding'];
  for (const name of authed) {
    assert.ok(scanRoutesSrc.includes(name), `scan routes should wire ${name}`);
  }
  assert.ok(scanRoutesSrc.includes('router.use(protect)'), 'report endpoints must sit behind protect');
  assert.ok(scanRoutesSrc.includes("router.put('/:id'"), 'PUT /:id must stay wired to updateScan');
});
