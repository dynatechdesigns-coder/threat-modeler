import { ScanReport } from '../models/ScanReport.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { saveFile } from '../services/storage.service.js';
import { startScan } from '../services/scanRunner.js';
import { cleanProject, shortSha, ciResult } from '../services/ci.js';
import { env } from '../config/env.js';
import { assertScanQuota } from '../services/entitlements.js';

const appUrl = () => env.appUrl || env.clientOrigins[0] || '';

/**
 * POST /api/ci/scan  (API token, multipart: file = zip of the repository)
 * fields: project (owner/repo), sha, role (baseline | pr)
 */
export const ciScan = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Upload the project as a .zip file in the "file" field');
  if (!/\.zip$/i.test(file.originalname)) throw new ApiError(400, 'The upload must be a .zip file');

  const project = cleanProject(req.body?.project);
  if (!project) throw new ApiError(400, 'Send a "project" name such as owner/repo');
  const sha = shortSha(req.body?.sha);
  const role = req.body?.role === 'baseline' ? 'baseline' : 'pr';

  const running = await ScanReport.countDocuments({ user: req.user._id, status: 'running' });
  if (running >= 3) throw new ApiError(429, 'Too many scans are running. Try again in a minute');
  await assertScanQuota(req.user);

  const saved = await saveFile({ ...file, originalname: `${project.replace(/\//g, '-')}.zip` }, req.user._id);
  const report = await ScanReport.create({
    user: req.user._id,
    name: `${project}${sha ? ` @ ${sha}` : ''}`.slice(0, 120),
    files: [saved],
    status: 'uploaded',
    origin: { kind: 'ci', repo: project, role, sha },
  });
  await startScan(report);
  res.status(202).json({ id: report._id, status: 'running' });
});

/** GET /api/ci/scans/:id (API token). Poll until status is completed or failed. */
export const ciStatus = asyncHandler(async (req, res) => {
  const current = await ScanReport.findOne({ _id: req.params.id, user: req.user._id, 'origin.kind': 'ci' });
  if (!current) throw new ApiError(404, 'Scan not found');

  if (current.status === 'failed') return res.json({ id: current._id, status: 'failed', error: current.error || 'The scan failed' });
  if (current.status !== 'completed') return res.json({ id: current._id, status: current.status });

  // Compare with the latest scan of the main branch for this project (not with the scan itself).
  const previous = await ScanReport.findOne({
    user: req.user._id,
    'origin.kind': 'ci',
    'origin.repo': current.origin.repo,
    'origin.role': 'baseline',
    status: 'completed',
    _id: { $ne: current._id },
    createdAt: { $lt: current.createdAt },
  }).sort({ createdAt: -1 });

  res.json({
    id: current._id,
    project: current.origin.repo,
    role: current.origin.role,
    reportUrl: appUrl() ? `${appUrl()}/reports/${current._id}` : '',
    ...ciResult(previous, current),
  });
});
