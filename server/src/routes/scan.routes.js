import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { scanLimiter, demoLimiter } from '../middleware/rateLimits.js';
import { listScans, getScan, updateScan, triggerScan, deleteScan, scanGithub, enableShare, disableShare, scanDemo, getDemoScan, rescan } from '../controllers/scan.controller.js';

const router = Router();
// Public judge demo: one-click scan plus result polling, no account needed.
// Per-IP rate limited (demoLimiter). Everything below this line needs sign-in.
router.post('/demo', demoLimiter, scanDemo);
router.get('/demo/:id', demoLimiter, getDemoScan);
router.use(protect);
router.get('/', listScans);
router.post('/github', scanLimiter, scanGithub);
router.get('/:id', getScan);
router.put('/:id', protect, updateScan);
router.post('/:id/trigger', scanLimiter, triggerScan);
router.post('/:id/rescan', scanLimiter, rescan);
router.post('/:id/share', enableShare);
router.delete('/:id/share', disableShare);
router.delete('/:id', deleteScan);

export default router;
