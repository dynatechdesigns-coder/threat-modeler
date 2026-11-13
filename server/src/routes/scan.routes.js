import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { scanLimiter } from '../middleware/rateLimits.js';
import { listScans, getScan, updateScan, triggerScan, deleteScan, scanGithub, enableShare, disableShare, scanDemo, rescan } from '../controllers/scan.controller.js';

const router = Router();
router.use(protect);
router.get('/', listScans);
router.post('/github', scanLimiter, scanGithub);
router.post('/demo', scanLimiter, scanDemo);
router.get('/:id', getScan);
router.put('/:id', protect, updateScan);
router.post('/:id/trigger', scanLimiter, triggerScan);
router.post('/:id/rescan', scanLimiter, rescan);
router.post('/:id/share', enableShare);
router.delete('/:id/share', disableShare);
router.delete('/:id', deleteScan);

export default router;
