import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.bat', '.cmd', '.msi', '.scr', '.com']);

// Files are kept in memory, then handed to the storage service (R2 or local disk).
// Up to 40 files: folder drops expand, and the scanner prioritizes and caps
// analysis itself (400 files / 10MB), so extras only cost upload bandwidth.
// The per-file cap alone still allows ~40 x maxUploadMb in RAM, which can OOM
// small hosts (Render): the total-size guards below bound the whole request.
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

/** Whole-request ceiling in bytes. Defaults to the configured per-file max. */
export const maxTotalBytes = () => env.maxUploadMb * 1024 * 1024;

/**
 * Rejects oversized multipart bodies BEFORE multer buffers them into memory,
 * using the declared Content-Length (multipart overhead gets a 2MB allowance).
 * Pass an explicit cap for the public demo, which is deliberately smaller.
 */
export const limitContentLength = (capBytes = maxTotalBytes()) => (req, _res, next) => {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > capBytes + 2 * 1024 * 1024) {
    return next(new ApiError(413, `Upload too large. Total must be under ${Math.round(capBytes / 1024 / 1024)}MB`));
  }
  next();
};

/**
 * Exact post-parse check: sums the buffered files and rejects anything over
 * the cap. Runs AFTER multer, so it also covers chunked bodies with no
 * Content-Length. Kept separate from limitContentLength on purpose.
 */
export const limitTotalSize = (capBytes = maxTotalBytes()) => (req, _res, next) => {
  const total = (req.files || []).reduce((n, f) => n + (f.size || 0), 0);
  if (total > capBytes) {
    return next(new ApiError(413, `Upload too large. Total must be under ${Math.round(capBytes / 1024 / 1024)}MB`));
  }
  next();
};
