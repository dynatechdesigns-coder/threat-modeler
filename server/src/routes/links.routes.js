import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { linkLimiter } from '../middleware/rateLimits.js';
import { checkLinksHandler } from '../controllers/links.controller.js';

const router = Router();
router.post('/check', protect, linkLimiter, checkLinksHandler);

export default router;
