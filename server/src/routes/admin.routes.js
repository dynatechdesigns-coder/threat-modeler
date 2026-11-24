import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { blockJudge } from '../middleware/judge.js';
import { requireAdmin } from '../middleware/admin.js';
import { stats } from '../controllers/admin.controller.js';

const router = Router();
router.get('/stats', protect, blockJudge, requireAdmin, stats);

export default router;
