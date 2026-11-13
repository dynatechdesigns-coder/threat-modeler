import { ScanReport } from '../models/ScanReport.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { deleteFile } from '../services/storage.service.js';
import { startScan } from '../services/scanRunner.js';
import { saveFile } from '../services/storage.service.js';
import { parseGithubUrl, downloadRepoZip, isGithubToken, GithubError } from '../services/github.js';
import { env } from '../config/env.js';
import { newShareToken } from '../services/share.js';
import { demoFiles } from '../services/demoProject.js';
import { assertScanQuota } from '../services/entitlements.js';

async function findOwned(req) {
  const report = await ScanReport.findOne({ _id: req.params.id, user: req.user._id });
  if (!report) throw new ApiError(404, 'Scan report not found');
  return report;
}

export const listScans = asyncHandler(async (req, res) => {
  const reports = await ScanReport.find({ user: req.user._id })
    .select('-findings -logs')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ reports });
});

export const getScan = asyncHandler(async (req, res) => {
  res.json({ report: await findOwned(req) });
});

/** Saves a frontend-generated AI threat matrix to the report. */
export const updateScan = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  if (req.body?.resultData !== undefined) report.resultData = req.body.resultData;
  if (req.body?.status !== undefined) report.status = req.body.status;
  await report.save();
  res.json({ report });
});

export const triggerScan = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  if (report.status === 'running') throw new ApiError(409, 'Scan is already running');
  if (report.filesDeleted) throw new ApiError(400, 'The uploaded code was deleted after the last scan, for your privacy. Upload it again to rescan');
  if (!report.files.length) throw new ApiError(400, 'Report has no files to scan');
  const running = await ScanReport.countDocuments({ user: req.user._id, status: 'running' });
  if (running >= 2) throw new ApiError(429, 'You already have 2 scans running. Wait for one to finish');
  if (report.origin?.kind !== 'demo') await assertScanQuota(req.user);

  await startScan(report);
  res.status(202).json({ report });
});

export const deleteScan = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  await Promise.all(report.files.map((f) => deleteFile(f.key, f.storage).catch(() => null)));
  await report.deleteOne();
  res.json({ success: true });
});

async function assertCanScan(user, { demo = false } = {}) {
  const running = await ScanReport.countDocuments({ user: user._id, status: 'running' });
  if (running >= 2) throw new ApiError(429, 'You already have 2 scans running. Wait for one to finish');
  if (!demo) await assertScanQuota(user);
}

/** Downloads a repository, saves it like an upload and starts the scan. A token (private repos) is used once and never saved. */
async function startGithubScan(user, { owner, repo, branch = '', token = '', name = '' }) {
  let zip;
  try {
    zip = await downloadRepoZip({ owner, repo, branch, token, maxBytes: env.maxUploadMb * 1024 * 1024 });
  } catch (err) {
    if (err instanceof GithubError) throw new ApiError(err.status, err.message);
    throw err;
  }

  const file = await saveFile(
    { originalname: `${zip.repo}.zip`, mimetype: 'application/zip', size: zip.buffer.length, buffer: zip.buffer },
    user._id
  );
  const report = await ScanReport.create({
    user: user._id,
    name: String(name).trim().slice(0, 120) || `${zip.owner}/${zip.repo}${zip.branch ? ` (${zip.branch})` : ''}`,
    files: [file],
    status: 'uploaded',
    origin: { kind: 'github', owner: zip.owner, repo: zip.repo, branch: zip.branch, private: Boolean(token) },
  });
  await startScan(report);
  return report;
}

async function startDemoScan(user) {
  const files = [];
  for (const f of demoFiles()) {
    const buffer = Buffer.from(f.content, 'utf8');
    files.push(await saveFile({ originalname: f.name, mimetype: 'text/plain', size: buffer.length, buffer }, user._id));
  }
  const report = await ScanReport.create({
    user: user._id,
    name: 'Demo: vulnerable app',
    files,
    status: 'uploaded',
    origin: { kind: 'demo' },
  });
  await startScan(report);
  return report;
}

/** Scans a GitHub repository by link. Add a read-only token for a private one. */
export const scanGithub = asyncHandler(async (req, res) => {
  await assertCanScan(req.user);

  let target;
  let token = '';
  try {
    target = parseGithubUrl(req.body?.url);
    token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token && !isGithubToken(token)) throw new GithubError('That does not look like a GitHub token');
  } catch (err) {
    if (err instanceof GithubError) throw new ApiError(err.status, err.message);
    throw err;
  }

  const report = await startGithubScan(req.user, { ...target, token, name: req.body?.name });
  res.status(202).json({ report });
});

/** Switches on a read-only public link for a finished report. Anyone with the link can read it, nobody can change it. */
export const enableShare = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  if (report.status !== 'completed') throw new ApiError(400, 'Only finished reports can be shared');
  if (!report.shareToken) {
    report.shareToken = newShareToken();
    await report.save();
  }
  res.json({ shareToken: report.shareToken });
});

/** Switches the link off. The old link stops working immediately. */
export const disableShare = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  report.shareToken = undefined;
  await report.save();
  res.json({ success: true });
});

/** One-click demo: scans a small built-in vulnerable project so a new person can see a real report right away. */
export const scanDemo = asyncHandler(async (req, res) => {
  await assertCanScan(req.user, { demo: true });
  res.status(202).json({ report: await startDemoScan(req.user) });
});

/**
 * Scan again. Works for the demo and for public GitHub repositories (the code is fetched fresh). Uploaded files and
 * private repositories were deleted or need a new token, so for those the person is asked to upload or paste again.
 */
export const rescan = asyncHandler(async (req, res) => {
  const old = await findOwned(req);
  const o = old.origin || {};
  await assertCanScan(req.user, { demo: o.kind === 'demo' });

  if (o.kind === 'demo') return res.status(202).json({ report: await startDemoScan(req.user) });
  if (o.kind === 'github' && !o.private) {
    const report = await startGithubScan(req.user, { owner: o.owner, repo: o.repo, branch: o.branch, name: old.name });
    return res.status(202).json({ report });
  }
  throw new ApiError(
    400,
    o.kind === 'github'
      ? 'This was a private repository. Paste the link and a fresh token in the Code Vault to scan it again'
      : 'The uploaded code was deleted after the scan, for your privacy. Upload it again in the Code Vault'
  );
});
