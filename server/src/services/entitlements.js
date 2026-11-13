import { WatchedRepo } from '../models/WatchedRepo.js';
import { ApiToken } from '../models/ApiToken.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { effectivePlan, scanBlockedReason, limitReason, scansUsed } from './plans.js';

export const planFor = (user) => effectivePlan(user, { billingEnabled: env.billing.enabled, adminEmails: env.adminEmails });

// The built-in demo never counts: it is how a new person sees a report.
export const scansThisMonth = (user) => scansUsed(user);

/** Throws a plain-language 402 when this month's scans are used up. */
export async function assertScanQuota(user) {
  const plan = planFor(user);
  const reason = scanBlockedReason(plan, scansThisMonth(user));
  if (reason) throw new ApiError(402, reason);
}

export async function assertWithinLimit(user, what) {
  const plan = planFor(user);
  const used = await (what === 'watches' ? WatchedRepo : ApiToken).countDocuments({ user: user._id });
  const reason = limitReason(plan, what, used);
  if (reason) throw new ApiError(402, reason);
}

export async function usageFor(user) {
  const [watches, tokens] = await Promise.all([
    WatchedRepo.countDocuments({ user: user._id }),
    ApiToken.countDocuments({ user: user._id }),
  ]);
  return { scans: scansThisMonth(user), watches, tokens };
}
