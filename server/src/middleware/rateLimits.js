import rateLimit from 'express-rate-limit';

const base = { standardHeaders: true, legacyHeaders: false };
const msg = (message) => ({ success: false, message });

// Everything under /api, per IP.
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: msg('Too many requests, please slow down'),
});

// Wrong passwords: 10 failed tries per 15 minutes per IP. Successful logins are not counted.
export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: msg('Too many login attempts, please try again in 15 minutes'),
});

export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: msg('Too many accounts created from this network, please try again later'),
});

// Per signed-in user (these run after the auth middleware). Scans cost AI money, so they are capped hardest.
const perUser = (req) => String(req.user?._id || 'anonymous');

export const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  message: msg('Upload limit reached (30 per hour). Please try again later'),
});

export const linkLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: perUser,
  message: msg('Link check limit reached (60 per hour). Please try again later'),
});

export const scanLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: perUser,
  message: msg('Scan limit reached (20 per hour). Please try again later'),
});

// Public share links need no sign-in, so they are limited per visitor address.
export const publicLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: msg('Too many requests, please try again later'),
});

// The header checker makes the server visit other websites, so it is capped per signed-in user.
export const headerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: perUser,
  message: msg('Header check limit reached (20 per hour). Please try again later'),
});

// Email-sending endpoints. They cost nothing to call but must not be usable to spam someone's inbox.
export const forgotLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: msg('Too many reset requests. Please try again in an hour'),
});

export const tokenLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: msg('Too many attempts. Please try again later'),
});

export const resendLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: perUser,
  message: msg('Too many verification emails. Please try again in an hour'),
});

// README badges are fetched by GitHub's image proxy for every viewer of every README, from a handful of addresses,
// so this limit is much higher than the others. The answer is also cached for 5 minutes.
export const badgeLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  message: msg('Too many requests'),
});

// CI scans: per API token owner. Each one runs a full scan, so the cap is modest.
export const ciLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  message: msg('CI scan limit reached (30 per hour). Please try again later'),
});
