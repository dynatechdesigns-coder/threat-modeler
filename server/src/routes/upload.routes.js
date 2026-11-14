import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadFiles, limitContentLength, limitTotalSize } from '../middleware/upload.js';
import { uploadAndCreateReport } from '../controllers/upload.controller.js';

const router = Router();
// Total-size guards bound the whole request (per-file multer cap alone allows
// ~40 x maxUploadMb buffered in RAM). Content-Length is checked before multer
// buffers anything; the exact sum is re-checked after parsing for chunked bodies.
router.post('/', protect, uploadLimiter, limitContentLength(), uploadFiles, limitTotalSize(), uploadAndCreateReport);

export default router;
