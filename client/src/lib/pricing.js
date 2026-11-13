// What the pricing section and the Billing page show. The limits match server/src/services/plans.js.
// Prices are in US dollars. Annual is 20% off: 12 months for the price of 9.6.
export const TIERS = [
  {
    key: 'free',
    name: 'Free',
    tagline: 'Try it on a side project',
    monthly: 0,
    annual: 0,
    features: [
      '5 scans per month',
      '1 watched repository',
      'Security rules and dependency check',
      'Fix suggestions with code examples',
      'PDF report download',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'For solo developers and bug bounty hunters',
    monthly: 5,
    annual: 48,
    highlighted: true,
    features: [
      '50 scans per month',
      'AI code review on every scan',
      '5 watched repositories',
      'README security badge',
      'GitHub Action and API tokens',
    ],
  },
  {
    key: 'team',
    name: 'Team',
    tagline: 'For teams shipping every day',
    monthly: 15,
    annual: 144,
    features: ['Everything in Pro', '300 scans per month', '25 watched repositories', 'Up to 20 API tokens for CI'],
  },
];

// Per-month price to display. Annual shows the monthly equivalent, and the yearly total is shown separately.
export const monthlyPrice = (tier, annual) => (annual ? tier.annual / 12 : tier.monthly);
export const formatPrice = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
