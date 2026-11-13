import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadFiles } from '../middleware/upload.js';
import { uploadAndCreateReport } from '../controllers/upload.controller.js';

const router = Router();
router.post('/', protect, uploadLimiter, uploadFiles, uploadAndCreateReport);

export default router;
