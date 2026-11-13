import { isAdminUser } from './admin.js';

// Prices are in US dollars. Annual is 20% off (12 months for the price of 9.6).
export const PRICES = {
  pro: { monthly: 5, annual: 48 },
  team: { monthly: 15, annual: 144 },
};

// Only things that exist and are enforced today.
export const PLANS = {
  free: { name: 'Free', scansPerMonth: 5, watches: 1, tokens: 0, ai: false, badge: false },
  pro: { name: 'Pro', scansPerMonth: 50, watches: 5, tokens: 5, ai: true, badge: true },
  team: { name: 'Team', scansPerMonth: 300, watches: 25, tokens: 20, ai: true, badge: true },
};

export const GRACE_DAYS = 3; // a late renewal does not cut access off the same minute
const DAY = 24 * 60 * 60 * 1000;
export const INTERVAL_DAYS = { monthly: 31, annual: 366 };

export const isTier = (t) => t === 'pro' || t === 'team';
export const isInterval = (i) => i === 'monthly' || i === 'annual';

/**
 * Which plan is this person on right now? Never trusts a stored label alone: paid access needs a period end that has
 * not passed (plus a short grace), so an unpaid or cancelled account falls back to Free by itself.
 *  - billing off (early access): everyone gets the Team limits
 *  - admins: Team limits, so they can test everything
 */
export function effectivePlan(user, { billingEnabled = false, adminEmails = [], now = Date.now() } = {}) {
  if (!billingEnabled) return { tier: 'team', source: 'early-access', ...PLANS.team, key: 'team' };
  if (isAdminUser(user, adminEmails)) return { tier: 'team', source: 'admin', ...PLANS.team, key: 'team' };

  const b = user?.billing || {};
  const end = b.currentPeriodEnd ? new Date(b.currentPeriodEnd).getTime() : 0;
  if (isTier(b.tier) && end && now < end + GRACE_DAYS * DAY) {
    return {
      tier: b.tier,
      key: b.tier,
      source: 'paid',
      interval: b.interval || null,
      status: b.status || 'active',
      periodEnd: new Date(end).toISOString(),
      renews: b.status === 'active' || b.status === 'attention',
      ...PLANS[b.tier],
    };
  }
  return { tier: 'free', key: 'free', source: 'free', ...PLANS.free };
}

export const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7); // "2026-11"

/** Scans started this month. Kept as a counter on the user, so deleting old reports cannot reset it. */
export const scansUsed = (user, now = Date.now()) => (user?.scanUsage?.month === monthKey(now) ? user.scanUsage.count || 0 : 0);

export const startOfMonthUTC = (now = Date.now()) => {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** Plain-language reason, or null when the person may go ahead. */
export function scanBlockedReason(plan, usedThisMonth) {
  if (usedThisMonth < plan.scansPerMonth) return null;
  return `You have used all ${plan.scansPerMonth} scans for this month on the ${plan.name} plan. ${plan.key === 'team' ? 'They reset on the 1st.' : 'Upgrade on the Billing page, or wait for the 1st.'}`;
}

export function limitReason(plan, what, used) {
  const cap = { watches: plan.watches, tokens: plan.tokens }[what];
  if (used < cap) return null;
  const label = what === 'watches' ? 'watched repositories' : 'API tokens';
  if (cap === 0) return `${label[0].toUpperCase()}${label.slice(1)} are part of the Pro plan. Upgrade on the Billing page`;
  return `Your ${plan.name} plan allows ${cap} ${label}. ${plan.key === 'team' ? 'Remove one first' : 'Remove one, or upgrade on the Billing page'}`;
}
