import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { stats } from '../controllers/admin.controller.js';

const router = Router();
router.get('/stats', protect, requireAdmin, stats);

export default router;
