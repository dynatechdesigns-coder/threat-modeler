import { Router } from 'express';
import { publicLimiter, badgeLimiter } from '../middleware/rateLimits.js';
import { getSharedReport, getBadge } from '../controllers/public.controller.js';

const router = Router();
router.get('/reports/:token', publicLimiter, getSharedReport);
router.get('/badge/:token', badgeLimiter, getBadge);

export default router;
