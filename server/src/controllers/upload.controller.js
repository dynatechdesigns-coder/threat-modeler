import { ScanReport } from '../models/ScanReport.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { saveFile } from '../services/storage.service.js';

export const uploadAndCreateReport = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) throw new ApiError(400, 'No files uploaded');

  const files = [];
  for (const file of req.files) {
    files.push(await saveFile(file, req.user._id));
  }

  const name = (req.body.name || '').trim() || files[0].originalName;
  const report = await ScanReport.create({ user: req.user._id, name, files, status: 'uploaded' });

  res.status(201).json({ report });
});
