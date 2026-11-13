import crypto from 'node:crypto';
import { INTERVAL_DAYS, isTier, isInterval, PRICES } from './plans.js';

const API = 'https://api.paystack.co';
const DAY = 24 * 60 * 60 * 1000;

/** Paystack signs the raw request body with your secret key (HMAC SHA-512). Anything else is rejected. */
export function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(secret, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not json */
  }
  if (!res.ok || !json?.status) {
    const err = new Error(json?.message || `Paystack error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

export const initTransaction = (secret, { email, planCode, tier, interval, callbackUrl, userId }, fetchImpl) =>
  call(secret, '/transaction/initialize', {
    method: 'POST',
    fetchImpl,
    body: {
      email,
      currency: 'USD',
      amount: PRICES[tier][interval] * 100, // cents. The plan code decides the real amount.
      plan: planCode,
      callback_url: callbackUrl,
      metadata: { userId: String(userId), tier, interval },
    },
  });

export const verifyTransaction = (secret, reference, fetchImpl) =>
  call(secret, `/transaction/verify/${encodeURIComponent(reference)}`, { fetchImpl });

export const getSubscription = (secret, code, fetchImpl) => call(secret, `/subscription/${encodeURIComponent(code)}`, { fetchImpl });

export const disableSubscription = (secret, code, token, fetchImpl) =>
  call(secret, '/subscription/disable', { method: 'POST', body: { code, token }, fetchImpl });

/** plan code -> { tier, interval }, from the four codes in the environment. */
export function planMapFrom(codes = {}) {
  const map = {};
  for (const [key, code] of Object.entries(codes)) {
    const [tier, interval] = key.split('_');
    if (code && isTier(tier) && isInterval(interval)) map[code] = { tier, interval };
  }
  return map;
}

const planCodeOf = (plan) => (typeof plan === 'string' ? plan : plan?.plan_code || '');

/**
 * Turns one verified Paystack event into a change for a user's billing record, plus the facts needed to find that user.
 * Returns null for events we do not act on. Pure, so it is easy to test.
 */
export function patchFromEvent(event, planMap, now = Date.now()) {
  const data = event?.data || {};
  const who = {
    subscriptionCode: data.subscription_code || data.subscription?.subscription_code || '',
    customerCode: data.customer?.customer_code || '',
    email: String(data.customer?.email || '').toLowerCase(),
    userId: data.metadata?.userId ? String(data.metadata.userId) : '',
  };
  const known = planMap[planCodeOf(data.plan)];
  const end = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : null);

  switch (event?.event) {
    case 'subscription.create': {
      if (!known) return null;
      return {
        who,
        patch: {
          ...known,
          status: 'active',
          subscriptionCode: data.subscription_code,
          customerCode: data.customer?.customer_code,
          currentPeriodEnd: end(data.next_payment_date) || new Date(now + INTERVAL_DAYS[known.interval] * DAY),
        },
      };
    }
    case 'charge.success': {
      // Only charges that belong to a subscription plan we sell. A one-off charge is ignored.
      if (!known) return null;
      return {
        who,
        patch: {
          ...known,
          status: 'active',
          customerCode: data.customer?.customer_code,
          currentPeriodEnd: new Date((end(data.paid_at)?.getTime() || now) + INTERVAL_DAYS[known.interval] * DAY),
        },
      };
    }
    case 'invoice.payment_failed':
      return { who, patch: { status: 'attention' } };
    case 'subscription.not_renew':
      return { who, patch: { status: 'non-renewing' } };
    case 'subscription.disable':
      return { who, patch: { status: 'cancelled' } };
    default:
      return null;
  }
}

/** Never lets an older or smaller event shorten a period that is already paid for. */
export function mergeBilling(current = {}, patch = {}) {
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null)) };
  const a = current.currentPeriodEnd ? new Date(current.currentPeriodEnd).getTime() : 0;
  const b = patch.currentPeriodEnd ? new Date(patch.currentPeriodEnd).getTime() : 0;
  if (a > b) next.currentPeriodEnd = current.currentPeriodEnd;
  return next;
}

/** From a verified transaction (the page the person returns to after paying). Null unless it really is a paid plan. */
export function patchFromTransaction(tx, planMap, userEmail, now = Date.now()) {
  if (!tx || tx.status !== 'success') return null;
  if (String(tx.customer?.email || '').toLowerCase() !== String(userEmail || '').toLowerCase()) return null;
  const known = planMap[planCodeOf(tx.plan)];
  if (!known) return null;
  return {
    ...known,
    status: 'active',
    customerCode: tx.customer?.customer_code,
    currentPeriodEnd: new Date(now + INTERVAL_DAYS[known.interval] * DAY),
    lastReference: tx.reference,
  };
}
