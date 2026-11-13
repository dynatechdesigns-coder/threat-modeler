import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { PLANS, PRICES, isTier, isInterval } from '../services/plans.js';
import { planFor, usageFor } from '../services/entitlements.js';
import {
  initTransaction,
  verifyTransaction,
  getSubscription,
  disableSubscription,
  planMapFrom,
  patchFromEvent,
  patchFromTransaction,
  mergeBilling,
  verifySignature,
} from '../services/paystack.js';

const planMap = () => planMapFrom(env.billing.planCodes);
const appUrl = () => env.appUrl || env.clientOrigins[0] || '';
const checkoutReady = () => Boolean(env.billing.secretKey) && Object.values(env.billing.planCodes).every(Boolean);

const publicPlan = (p) => ({
  key: p.key,
  name: p.name,
  source: p.source,
  interval: p.interval || null,
  status: p.status || null,
  periodEnd: p.periodEnd || null,
  renews: Boolean(p.renews),
  limits: { scansPerMonth: p.scansPerMonth, watches: p.watches, tokens: p.tokens, ai: p.ai, badge: p.badge },
});

async function applyBilling(userId, patch) {
  const user = await User.findById(userId);
  if (!user) return;
  const current = user.toObject().billing || {};
  await User.updateOne({ _id: user._id }, { $set: { billing: mergeBilling(current, patch) } });
}

/** Public: what the pricing section shows. */
export const getPlans = asyncHandler(async (_req, res) => {
  res.json({ plans: PLANS, prices: PRICES, billingEnabled: env.billing.enabled, checkoutReady: checkoutReady() });
});

export const getMyBilling = asyncHandler(async (req, res) => {
  res.json({
    billingEnabled: env.billing.enabled,
    checkoutReady: checkoutReady(),
    plan: publicPlan(planFor(req.user)),
    usage: await usageFor(req.user),
    prices: PRICES,
  });
});

export const startCheckout = asyncHandler(async (req, res) => {
  const { tier, interval } = req.body || {};
  if (!isTier(tier) || !isInterval(interval)) throw new ApiError(400, 'Choose a plan and monthly or annual billing');
  if (!env.billing.enabled || !checkoutReady()) throw new ApiError(503, 'Payments are not switched on yet');
  if (!req.user.emailVerified) throw new ApiError(403, 'Confirm your email address first, then upgrade');

  const current = planFor(req.user);
  if (current.source === 'paid' && current.renews && current.key === tier && current.interval === interval) {
    throw new ApiError(400, 'You are already on this plan');
  }

  try {
    const tx = await initTransaction(env.billing.secretKey, {
      email: req.user.email,
      planCode: env.billing.planCodes[`${tier}_${interval}`],
      tier,
      interval,
      callbackUrl: `${appUrl()}/billing`,
      userId: req.user._id,
    });
    res.json({ url: tx.authorization_url, reference: tx.reference });
  } catch (err) {
    console.error('Paystack checkout failed:', err.message);
    throw new ApiError(502, 'The payment provider did not respond. Please try again in a minute');
  }
});

/** The person comes back from Paystack with ?reference=... Confirm it with Paystack ourselves, never trust the URL. */
export const verifyCheckout = asyncHandler(async (req, res) => {
  const reference = String(req.body?.reference || '');
  if (!/^[\w.-]{6,100}$/.test(reference)) throw new ApiError(400, 'That payment reference is not valid');
  if (req.user.billing?.lastReference === reference) return res.json({ ok: true, alreadyApplied: true });

  let tx;
  try {
    tx = await verifyTransaction(env.billing.secretKey, reference);
  } catch (err) {
    console.error('Paystack verify failed:', err.message);
    throw new ApiError(502, 'Could not reach the payment provider. Refresh in a minute');
  }
  const patch = patchFromTransaction(tx, planMap(), req.user.email);
  if (!patch) throw new ApiError(400, 'We could not confirm that payment yet. If you paid, wait a minute and refresh this page');
  await applyBilling(req.user._id, patch);
  res.json({ ok: true });
});

export const cancelPlan = asyncHandler(async (req, res) => {
  const code = req.user.billing?.subscriptionCode;
  if (!code) throw new ApiError(400, 'No active subscription was found. If you just paid, wait a minute and refresh');
  try {
    const sub = await getSubscription(env.billing.secretKey, code);
    await disableSubscription(env.billing.secretKey, code, sub.email_token);
  } catch (err) {
    console.error('Paystack cancel failed:', err.message);
    throw new ApiError(502, 'Could not cancel with the payment provider. Please try again');
  }
  await applyBilling(req.user._id, { status: 'non-renewing' });
  res.json({ ok: true });
});

/** Paystack calls this. Only a request signed with our secret key is believed. */
export const paystackWebhook = asyncHandler(async (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-paystack-signature'), env.billing.secretKey)) {
    return res.status(401).json({ success: false, message: 'Bad signature' });
  }
  const result = patchFromEvent(req.body, planMap());
  if (!result) return res.sendStatus(200);

  const { who, patch } = result;
  const conditions = [];
  if (who.subscriptionCode) conditions.push({ 'billing.subscriptionCode': who.subscriptionCode });
  if (who.customerCode) conditions.push({ 'billing.customerCode': who.customerCode });
  if (who.userId && mongoose.isValidObjectId(who.userId)) conditions.push({ _id: who.userId });
  if (who.email) conditions.push({ email: who.email, emailVerified: true });
  if (!conditions.length) return res.sendStatus(200);

  const user = await User.findOne({ $or: conditions });
  if (user) await applyBilling(user._id, patch);
  res.sendStatus(200);
});
