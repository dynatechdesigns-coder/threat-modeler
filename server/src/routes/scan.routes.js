import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { uploadFiles } from '../middleware/upload.js';
import { scanLimiter, demoLimiter, demoPollLimiter } from '../middleware/rateLimits.js';
import { listScans, getScan, updateScan, triggerScan, deleteScan, scanGithub, enableShare, disableShare, scanDemo, scanDemoUpload, scanDemoGithub, getDemoScan, rescan } from '../controllers/scan.controller.js';

const router = Router();
// Public judge demo: one-click scan, own-code upload, public-repo link,
// plus result polling. No account needed. Creation is per-IP rate limited
// (demoLimiter); everything below this line needs sign-in.
router.post('/demo', demoLimiter, scanDemo);
router.post('/demo/upload', demoLimiter, uploadFiles, scanDemoUpload);
router.post('/demo/github', demoLimiter, scanDemoGithub);
router.get('/demo/:id', demoPollLimiter, getDemoScan);
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
