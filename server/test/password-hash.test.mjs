import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/User.js';
import { register } from '../src/controllers/auth.controller.js';
import { demoLogin } from '../src/controllers/auth.controller.js';
import { verifyToken } from '../src/utils/jwt.js';
import { env } from '../src/config/env.js';

// The registered pre('save') password hook, invoked directly on a document.
// No database is touched: `new User()` never connects, and the hook is the
// real one Mongoose runs on save.
const hook = () => {
  const pres = User.schema.s.hooks._pres.get('save') || [];
  const found = pres.map((h) => h.fn).find((fn) => fn.name === 'hashPassword');
  assert.ok(found, 'hashPassword pre-save hook is registered');
  return found;
};

// Mimics what User.create does on the way to the database: build the document
// and run the real pre-save hook, without needing MongoDB.
const simulateCreate = async (data) => {
  const user = new User(data);
  await hook().call(user);
  return user;
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

const realFindOne = User.findOne;
const realCreate = User.create;
const restore = () => {
  User.findOne = realFindOne;
  User.create = realCreate;
};

test('the pre-save hook takes no callback parameter', () => {
  assert.equal(hook().length, 0);
});

test('creating a user hashes the password with bcrypt (work factor 12)', async () => {
  const user = await simulateCreate({ name: 'Test User', email: 'test@example.com', password: 'correct horse 999' });
  assert.notEqual(user.password, 'correct horse 999');
  assert.equal(bcrypt.getRounds(user.password), 12);
});

test('password comparison accepts the right password and rejects the wrong one', async () => {
  const user = await simulateCreate({ name: 'Test User', email: 'test@example.com', password: 'correct horse 999' });
  assert.equal(await user.comparePassword('correct horse 999'), true);
  assert.equal(await user.comparePassword('wrong password 000'), false);
});

test('accounts without a password are left alone and never authenticate', async () => {
  const user = new User({ name: 'Google User', email: 'g@example.com', googleId: 'google-id-1' });
  await hook().call(user);
  assert.equal(user.password, undefined);
  assert.equal(await user.comparePassword('anything'), false);
});

test('saving unrelated fields does not rehash the password', async () => {
  const user = await simulateCreate({ name: 'Test User', email: 'test@example.com', password: 'correct horse 999' });
  const hash = user.password;
  user.$__reset(); // simulate the clean state after a save
  user.name = 'Renamed User';
  assert.ok(!user.isModified('password'));
  await hook().call(user);
  assert.equal(user.password, hash);
  assert.ok(await user.comparePassword('correct horse 999'));
});

test('ordinary registration stores a hash and returns a working session', async () => {
  User.findOne = async () => null;
  User.create = simulateCreate;
  try {
    const { res, errors } = await run(register, {
      body: { name: 'Test User', email: 'test@example.com', password: 'correct horse 999' },
    });
    assert.deepEqual(errors, []);
    assert.equal(res.statusCode, 201);
    assert.ok(typeof res.body.token === 'string');
    assert.equal(res.body.user.email, 'test@example.com');
    assert.equal(res.body.user.password, undefined);
    const payload = verifyToken(res.body.token);
    assert.ok(payload.sub);
  } finally {
    restore();
  }
});

test('registration refuses a duplicate email without touching the database write', async () => {
  let created = false;
  User.findOne = async () => ({ _id: 'existing' });
  User.create = async () => {
    created = true;
    throw new Error('must not create');
  };
  try {
    const { errors } = await run(register, {
      body: { name: 'Test User', email: 'test@example.com', password: 'correct horse 999' },
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].statusCode, 409);
    assert.equal(created, false);
  } finally {
    restore();
  }
});

test('judge account creation hashes its secret and yields a verifiable session', async () => {
  User.create = simulateCreate;
  const flag = env.demoLogin.enabled;
  env.demoLogin.enabled = true;
  try {
    const first = await run(demoLogin, { body: {} });
    const second = await run(demoLogin, { body: {} });
    assert.deepEqual(first.errors, []);
    assert.deepEqual(second.errors, []);
    for (const r of [first, second]) {
      assert.ok(typeof r.res.body.token === 'string');
      assert.equal(r.res.body.user.judge, true);
      const payload = verifyToken(r.res.body.token);
      assert.equal(String(payload.sub), String(r.res.body.user._id));
    }
    assert.notEqual(String(first.res.body.user._id), String(second.res.body.user._id));
  } finally {
    env.demoLogin.enabled = flag;
    restore();
  }
});
