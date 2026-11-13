import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { joinWaitlist } from '../controllers/waitlist.controller.js';

const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-ups from this network, please try again later' },
});

const router = Router();
router.post('/', waitlistLimiter, joinWaitlist);

export default router;
