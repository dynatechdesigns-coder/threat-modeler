import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { githubWebhook } from '../controllers/webhook.controller.js';
import { paystackWebhook } from '../controllers/billing.controller.js';

// GitHub sends from many addresses, so this is a loose safety net against floods, not a per-user limit.
const hookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});

const router = Router();
// The raw bytes are kept (req.rawBody) because the signature is calculated over exactly what GitHub sent.
router.post(
  '/github/:id',
  hookLimiter,
  express.json({ limit: '5mb', verify: (req, _res, buf) => (req.rawBody = buf) }),
  githubWebhook
);

// Paystack payment events. Signed with our secret key, checked over the raw bytes.
router.post(
  '/paystack',
  hookLimiter,
  express.json({ limit: '1mb', verify: (req, _res, buf) => (req.rawBody = buf) }),
  paystackWebhook
);

export default router;
