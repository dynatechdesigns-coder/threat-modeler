import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.bat', '.cmd', '.msi', '.scr', '.com']);

// Files are kept in memory, then handed to the storage service (R2 or local disk).
// Up to 40 files: folder drops expand, and the scanner prioritizes and caps
// analysis itself (400 files / 10MB), so extras only cost upload bandwidth.
export const uploadFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 40 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new ApiError(400, `File type ${ext} is not allowed`));
    }
    cb(null, true);
  },
}).array('files', 40);
