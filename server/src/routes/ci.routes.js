import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { protectApiToken } from '../middleware/apiToken.js';
import { ciLimiter } from '../middleware/rateLimits.js';
import { ciScan, ciStatus } from '../controllers/ci.controller.js';

const router = Router();
const zipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 } }).single('file');

router.post('/scan', protectApiToken, ciLimiter, zipUpload, ciScan);
router.get('/scans/:id', protectApiToken, ciStatus);

export default router;
