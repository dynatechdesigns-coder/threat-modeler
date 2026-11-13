import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { headerLimiter } from '../middleware/rateLimits.js';
import { checkHeadersHandler } from '../controllers/headers.controller.js';

const router = Router();
router.post('/check', protect, headerLimiter, checkHeadersHandler);

export default router;
