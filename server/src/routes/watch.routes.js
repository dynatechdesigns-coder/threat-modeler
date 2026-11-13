import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listWatches, createWatch, getSetup, deleteWatch, enableBadge, disableBadge, getBadgeInfo } from '../controllers/watch.controller.js';

const router = Router();
router.use(protect);
router.get('/', listWatches);
router.post('/', createWatch);
router.get('/:id/setup', getSetup);
router.get('/:id/badge', getBadgeInfo);
router.post('/:id/badge', enableBadge);
router.delete('/:id/badge', disableBadge);
router.delete('/:id', deleteWatch);

export default router;
