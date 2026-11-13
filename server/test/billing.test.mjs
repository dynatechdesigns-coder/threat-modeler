import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { effectivePlan, scanBlockedReason, limitReason, startOfMonthUTC, monthKey, scansUsed, PLANS, PRICES } from '../src/services/plans.js';
import { verifySignature, patchFromEvent, patchFromTransaction, mergeBilling, planMapFrom } from '../src/services/paystack.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12);
const on = { billingEnabled: true, now: NOW };
const user = (billing, extra = {}) => ({ email: 'a@b.co', emailVerified: true, billing, ...extra });

test('prices: annual is 20% off', () => {
  assert.equal(PRICES.pro.annual, PRICES.pro.monthly * 12 * 0.8);
  assert.equal(PRICES.team.annual, PRICES.team.monthly * 12 * 0.8);
});

test('billing off: everyone gets the Team limits (early access)', () => {
  const p = effectivePlan(user(), { billingEnabled: false });
  assert.equal(p.key, 'team');
  assert.equal(p.source, 'early-access');
});

test('no payment means Free', () => {
  const p = effectivePlan(user(), on);
  assert.equal(p.key, 'free');
  assert.equal(p.ai, false);
  assert.equal(p.scansPerMonth, PLANS.free.scansPerMonth);
});

test('paid access needs a period that has not ended; a short grace covers late renewals', () => {
  const b = (end) => ({ tier: 'pro', interval: 'monthly', status: 'active', currentPeriodEnd: new Date(end) });
  assert.equal(effectivePlan(user(b(NOW + DAY)), on).key, 'pro');
  assert.equal(effectivePlan(user(b(NOW - DAY)), on).key, 'pro', 'inside the 3-day grace');
  assert.equal(effectivePlan(user(b(NOW - 5 * DAY)), on).key, 'free');
  // a tier label with no end date is not trusted
  assert.equal(effectivePlan(user({ tier: 'team', status: 'active' }), on).key, 'free');
});

test('cancelled stays on the plan until the period it paid for ends', () => {
  const p = effectivePlan(user({ tier: 'pro', interval: 'annual', status: 'non-renewing', currentPeriodEnd: new Date(NOW + 100 * DAY) }), on);
  assert.equal(p.key, 'pro');
  assert.equal(p.renews, false);
});

test('admins get Team limits so they can test everything', () => {
  const p = effectivePlan(user(), { ...on, adminEmails: ['a@b.co'] });
  assert.equal(p.source, 'admin');
  // an unconfirmed address does not count
  assert.equal(effectivePlan(user(undefined, { emailVerified: false }), { ...on, adminEmails: ['a@b.co'] }).key, 'free');
});

test('quota messages', () => {
  assert.equal(scanBlockedReason(effectivePlan(user(), on), 4), null);
  assert.match(scanBlockedReason(effectivePlan(user(), on), 5), /all 5 scans.*Free.*Upgrade/);
  const team = effectivePlan(user(), { billingEnabled: false });
  assert.match(scanBlockedReason(team, 300), /reset on the 1st/);
  const free = effectivePlan(user(), on);
  assert.match(limitReason(free, 'tokens', 0), /part of the Pro plan/);
  assert.equal(limitReason(free, 'watches', 0), null);
  assert.match(limitReason(free, 'watches', 1), /allows 1/);
});

test('month starts on the 1st, UTC', () => {
  assert.equal(startOfMonthUTC(Date.UTC(2026, 10, 30, 23)).toISOString(), '2026-11-01T00:00:00.000Z');
});

test('webhook signature: only our key, over the exact bytes', () => {
  const body = Buffer.from('{"event":"charge.success"}');
  const sig = crypto.createHmac('sha512', 'sk_test_x').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 'sk_test_x'), true);
  assert.equal(verifySignature(body, sig, 'other'), false);
  assert.equal(verifySignature(Buffer.from('{"event":"charge.success" }'), sig, 'sk_test_x'), false);
  assert.equal(verifySignature(body, '', 'sk_test_x'), false);
  assert.equal(verifySignature(body, sig, ''), false);
  assert.equal(verifySignature(body, 'short', 'sk_test_x'), false);
});

const map = planMapFrom({ pro_monthly: 'PLN_pm', pro_annual: 'PLN_pa', team_monthly: 'PLN_tm', team_annual: 'PLN_ta', bad_x: 'PLN_z' });

test('plan codes map to tier and interval', () => {
  assert.deepEqual(map.PLN_pa, { tier: 'pro', interval: 'annual' });
  assert.equal(map.PLN_z, undefined);
});

test('subscription.create sets the plan and the exact renewal date', () => {
  const r = patchFromEvent({ event: 'subscription.create', data: { subscription_code: 'SUB_1', next_payment_date: '2026-12-12T00:00:00.000Z', plan: { plan_code: 'PLN_tm' }, customer: { customer_code: 'CUS_1', email: 'A@B.co' } } }, map, NOW);
  assert.equal(r.patch.tier, 'team');
  assert.equal(r.patch.interval, 'monthly');
  assert.equal(r.patch.currentPeriodEnd.toISOString(), '2026-12-12T00:00:00.000Z');
  assert.equal(r.who.email, 'a@b.co');
  assert.equal(r.who.subscriptionCode, 'SUB_1');
});

test('charge.success extends only for a plan we sell', () => {
  const ok = patchFromEvent({ event: 'charge.success', data: { paid_at: '2026-11-12T10:00:00.000Z', plan: { plan_code: 'PLN_pa' }, customer: { email: 'a@b.co' } } }, map, NOW);
  assert.equal(ok.patch.interval, 'annual');
  assert.ok(ok.patch.currentPeriodEnd.getTime() > Date.parse('2027-11-01'));
  assert.equal(patchFromEvent({ event: 'charge.success', data: { plan: {}, customer: { email: 'a@b.co' } } }, map, NOW), null, 'one-off charge');
  assert.equal(patchFromEvent({ event: 'charge.success', data: { plan: { plan_code: 'PLN_unknown' } } }, map, NOW), null);
});

test('status events and unknown events', () => {
  assert.equal(patchFromEvent({ event: 'invoice.payment_failed', data: { subscription: { subscription_code: 'S' }, customer: {} } }, map).patch.status, 'attention');
  assert.equal(patchFromEvent({ event: 'subscription.not_renew', data: { subscription_code: 'S' } }, map).patch.status, 'non-renewing');
  assert.equal(patchFromEvent({ event: 'subscription.disable', data: { subscription_code: 'S' } }, map).patch.status, 'cancelled');
  assert.equal(patchFromEvent({ event: 'transfer.success', data: {} }, map), null);
  assert.equal(patchFromEvent(null, map), null);
});

test('a returning payment is only accepted when it is paid, a known plan and the same person', () => {
  const tx = { status: 'success', reference: 'ref_123456', plan: 'PLN_pm', customer: { email: 'A@b.co', customer_code: 'CUS_1' } };
  const p = patchFromTransaction(tx, map, 'a@b.co', NOW);
  assert.equal(p.tier, 'pro');
  assert.equal(p.lastReference, 'ref_123456');
  assert.equal(patchFromTransaction({ ...tx, status: 'failed' }, map, 'a@b.co', NOW), null);
  assert.equal(patchFromTransaction(tx, map, 'someone@else.co', NOW), null, 'someone else paid');
  assert.equal(patchFromTransaction({ ...tx, plan: null }, map, 'a@b.co', NOW), null, 'no plan');
});

test('an older event never shortens a paid period', () => {
  const current = { tier: 'pro', currentPeriodEnd: new Date(NOW + 60 * DAY), status: 'active' };
  const merged = mergeBilling(current, { status: 'active', currentPeriodEnd: new Date(NOW + 10 * DAY) });
  assert.equal(new Date(merged.currentPeriodEnd).getTime(), NOW + 60 * DAY);
  assert.equal(mergeBilling(current, { status: 'cancelled' }).status, 'cancelled');
  assert.equal(mergeBilling(current, { status: 'cancelled' }).tier, 'pro');
});

test('scan counter belongs to the current month only', () => {
  assert.equal(monthKey(NOW), '2026-11');
  assert.equal(scansUsed({ scanUsage: { month: '2026-11', count: 4 } }, NOW), 4);
  assert.equal(scansUsed({ scanUsage: { month: '2026-10', count: 50 } }, NOW), 0, 'a new month starts at zero');
  assert.equal(scansUsed({}, NOW), 0);
});
