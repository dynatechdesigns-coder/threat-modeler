import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { ScanReport } from '../src/models/ScanReport.js';
import { demoLogin, JUDGE_SESSION_TTL_SECONDS } from '../src/controllers/auth.controller.js';
import { getScan } from '../src/controllers/scan.controller.js';
import { protect } from '../src/middleware/auth.js';
import { blockJudge } from '../src/middleware/judge.js';
import { perUser, demoLoginLimiter } from '../src/middleware/rateLimits.js';
import { signToken, verifyToken } from '../src/utils/jwt.js';
import { env } from '../src/config/env.js';

const authSrc = fs.readFileSync(new URL('../src/controllers/auth.controller.js', import.meta.url), 'utf8');
const authRoutesSrc = fs.readFileSync(new URL('../src/routes/auth.routes.js', import.meta.url), 'utf8');

const realFindOne = User.findOne;
const realFindById = User.findById;
const realCreate = User.create;
const realScanFindOne = ScanReport.findOne;
const restoreAll = () => {
  User.findOne = realFindOne;
  User.findById = realFindById;
  User.create = realCreate;
  ScanReport.findOne = realScanFindOne;
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

// A real (unsaved) User document: toJSON transform applies, no database needed.
const judgeDoc = (over = {}) =>
  new User({
    name: 'Hackathon Judge',
    email: `judge-test-${Math.random().toString(36).slice(2)}@judge.local`,
    password: 'x'.repeat(32),
    emailVerified: true,
    judge: true,
    ...over,
  });

test('demo login mints a fresh isolated identity on every call', async () => {
  const created = [];
  User.findOne = async () => {
    throw new Error('demo login must never look up an existing account');
  };
  User.create = async (data) => {
    created.push(data);
    return judgeDoc({ email: data.email });
  };
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const first = await run(demoLogin, { body: {} });
    const second = await run(demoLogin, { body: {} });
    assert.deepEqual(first.errors, []);
    assert.deepEqual(second.errors, []);
    assert.equal(created.length, 2);
    assert.notEqual(created[0].email, created[1].email);
    for (const data of created) {
      assert.equal(data.judge, true);
      assert.equal(data.emailVerified, true);
      assert.ok(typeof data.password === 'string' && data.password.length >= 32);
    }
    assert.notEqual(first.res.body.user._id, second.res.body.user._id);
    assert.equal(first.res.body.user.judge, true);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('demo login never hands out a session for an existing ordinary account', async () => {
  const existing = judgeDoc({ email: 'judge@hackathon.com', judge: false });
  User.findOne = async () => existing; // the old shared account, if one lingers
  let created = null;
  User.create = async (data) => {
    created = data;
    return judgeDoc({ email: data.email });
  };
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const { res, errors } = await run(demoLogin, { body: {} });
    assert.deepEqual(errors, []);
    assert.notEqual(String(res.body.user._id), String(existing._id));
    assert.ok(created, 'a new identity must be created');
    assert.equal(created.judge, true);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('demo login returns a short-lived token and keeps the { token, user } shape', async () => {
  User.create = async (data) => judgeDoc({ email: data.email });
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const { res, errors } = await run(demoLogin, { body: {} });
    assert.deepEqual(errors, []);
    assert.ok(typeof res.body.token === 'string');
    assert.ok(res.body.user);
    assert.equal(res.body.expiresIn, JUDGE_SESSION_TTL_SECONDS);
    assert.equal(JUDGE_SESSION_TTL_SECONDS, 12 * 60 * 60);
    const payload = verifyToken(res.body.token);
    assert.equal(String(payload.sub), String(res.body.user._id));
    assert.equal(payload.exp - payload.iat, JUDGE_SESSION_TTL_SECONDS);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('demo login stays invisible when disabled', async () => {
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = false;
  try {
    const { errors } = await run(demoLogin, { body: {} });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('protect accepts a fresh judge session and marks it', async () => {
  const doc = judgeDoc();
  User.findById = async () => doc;
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const token = signToken(doc._id, { expiresIn: '12h' });
    const { errors, req } = await (async () => {
      const res = mockRes();
      const errors = [];
      const req = { headers: { authorization: `Bearer ${token}` } };
      await protect(req, res, (err) => errors.push(err));
      return { errors, req };
    })();
    assert.ok(
      errors.every((e) => e === undefined),
      'a fresh judge session must pass protect without errors'
    );
    assert.equal(req.isJudge, true);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('switching the demo login off revokes judge sessions but not ordinary ones', async () => {
  const judge = judgeDoc();
  const ordinary = judgeDoc({ email: 'user@example.com', judge: false });
  const byId = { [String(judge._id)]: judge, [String(ordinary._id)]: ordinary };
  User.findById = async (id) => byId[String(id)] || null;
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = false;
  try {
    const judgeReq = { headers: { authorization: `Bearer ${signToken(judge._id)}` } };
    const judgeErrors = [];
    await protect(judgeReq, mockRes(), (err) => judgeErrors.push(err));
    assert.equal(judgeErrors.length, 1);
    assert.equal(judgeErrors[0].statusCode, 401);

    const userReq = { headers: { authorization: `Bearer ${signToken(ordinary._id)}` } };
    const userErrors = [];
    await protect(userReq, mockRes(), (err) => userErrors.push(err));
    assert.ok(
      userErrors.every((e) => e === undefined),
      'an ordinary session must survive the judge kill-switch'
    );
    assert.equal(userReq.isJudge, false);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('expired tokens and deleted judge users are rejected', async () => {
  const doc = judgeDoc();
  User.findById = async () => doc;
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const expired = jwt.sign({ sub: String(doc._id) }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '-10s' });
    const expiredErrors = [];
    await protect({ headers: { authorization: `Bearer ${expired}` } }, mockRes(), (err) =>
      expiredErrors.push(err)
    );
    assert.equal(expiredErrors.length, 1);
    // The raw error carries its JWT name; the error middleware maps it to HTTP 401.
    assert.equal(expiredErrors[0].name, 'TokenExpiredError');
    const errorSrc = fs.readFileSync(new URL('../src/middleware/error.js', import.meta.url), 'utf8');
    assert.ok(errorSrc.includes('TokenExpiredError'), 'expired tokens must map to 401');

    User.findById = async () => null; // judge account deleted by an admin
    const goneErrors = [];
    await protect({ headers: { authorization: `Bearer ${signToken(doc._id)}` } }, mockRes(), (err) =>
      goneErrors.push(err)
    );
    assert.equal(goneErrors.length, 1);
    assert.equal(goneErrors[0].statusCode, 401);
  } finally {
    env.demoLogin.enabled = flag;
    restoreAll();
  }
});

test('blockJudge bars judge sessions from account features, nobody else', async () => {
  const blocked = [];
  blockJudge({ isJudge: true }, {}, (err) => blocked.push(err));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].statusCode, 403);

  for (const req of [{ isJudge: false }, {}]) {
    const calls = [];
    blockJudge(req, {}, (err) => calls.push(err));
    assert.deepEqual(calls, [undefined]);
  }
});

test('judge A cannot read judge B reports (owner scoping covers judge identities)', async () => {
  const docB = { _id: 'report-jb', user: 'judge-B' };
  ScanReport.findOne = async (filter) => {
    if (filter && String(filter.user) !== String(docB.user)) return null;
    return docB;
  };
  try {
    const { res, errors } = await run(getScan, { params: { id: 'report-jb' }, user: { _id: 'judge-A' } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 404);
    assert.equal(res.body, undefined);
  } finally {
    restoreAll();
  }
});

test('rate-limit keys pin judge sessions to the visitor address', () => {
  assert.equal(perUser({ isJudge: true, ip: '203.0.113.7', user: { _id: 'J1' } }), 'judge:203.0.113.7');
  assert.equal(perUser({ isJudge: true, ip: '203.0.113.7', user: { _id: 'J2' } }), 'judge:203.0.113.7');
  assert.equal(perUser({ isJudge: false, ip: '203.0.113.7', user: { _id: 'U1' } }), 'U1');
  assert.equal(perUser({}), 'anonymous');
});

test('judge restrictions are wired at the route layer', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const tokens = read('../src/routes/tokens.routes.js');
  const watches = read('../src/routes/watch.routes.js');
  const billing = read('../src/routes/billing.routes.js');
  const admin = read('../src/routes/admin.routes.js');
  const authRoutes = read('../src/routes/auth.routes.js');
  for (const [name, src] of [['tokens', tokens], ['watches', watches], ['billing', billing], ['admin', admin]]) {
    assert.ok(src.includes('blockJudge'), `${name} routes must block judge sessions`);
  }
  assert.ok(tokens.includes('router.use(protect, blockJudge)'), 'tokens must check then block');
  assert.ok(authRoutes.includes('demoLoginLimiter'), 'demo login needs its own creation cap');
  assert.ok(authRoutes.includes("router.post('/demo', demoLoginLimiter, demoLogin)"), 'demo login must use it');
  assert.ok(demoLoginLimiter !== undefined, 'demo login limiter is exported');
  assert.ok(authSrc.includes('judge: true'), 'demo login must flag the new identity');
  assert.ok(authSrc.includes('expiresIn: JUDGE_SESSION_TTL'), 'demo login must mint a short-lived token');
});
