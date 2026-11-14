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
import { getRemediationPatch } from '../services/remediation.js';

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
export const updateScan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resultData } = req.body;

    // 1. Allowlist status updates to prevent arbitrary state injection
    const allowedStatuses = ['completed', 'failed', 'running', 'uploaded'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid scan status value.' });
    }

    const scan = await Scan.findById(id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan report not found.' });
    }

    // 2. Prevent client-supplied findings/resultData if the report is marked public or shared
    if (scan.isShared && resultData) {
      return res.status(403).json({ error: 'Cannot modify result data on shared reports.' });
    }

    if (status) scan.status = status;
    if (resultData && !scan.isShared) scan.resultData = resultData;

    await scan.save();
    return res.status(200).json({ success: true, scan });
  } catch (error) {
    console.error('Update scan error:', error);
    return res.status(500).json({ error: 'Server error updating scan report.' });
  }
};
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

/**
 * Public demo guardrails (anonymous AI-burn surface). The scanner itself only
 * analyzes ~10MB (see fileLoader LIMITS), so anything above that is bandwidth
 * and storage cost with no extra findings — hence the deliberately small caps.
 * No CAPTCHA service is configured, so size + concurrency + TTL do the work.
 */
export const DEMO_MAX_FILES = 40;
export const DEMO_MAX_BYTES = 10 * 1024 * 1024;
export const DEMO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const demoExpiresAt = (now = Date.now()) => new Date(now + DEMO_TTL_MS);

/**
 * Strips everything an anonymous poller must not see: the owner id, storage
 * keys/paths, storage backend, per-file and per-finding internal ids, and any
 * share token. Top-level _id stays — the client needs it for polling.
 */
export function toPublicDemoReport(doc) {
  const out = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  delete out.user;
  delete out.shareToken;
  delete out.__v;
  out.files = (out.files || []).map((f) => ({
    originalName: f.originalName,
    size: f.size,
    mimeType: f.mimeType,
  }));
  out.findings = (out.findings || []).map((f) => {
    const { _id, ...rest } = f;
    return rest;
  });
  return out;
}

async function assertCanScan(user, { demo = false } = {}) {
  if (!user) {
    // Anonymous judge demo: no quota system without an account, so a small
    // global cap on concurrent demo scans plus the per-IP demoLimiter instead.
    // New reports start as 'uploaded', so both states count — otherwise a
    // burst of simultaneous POSTs all passes the check before any of them
    // flips to 'running', and each burns a full AI scan.
    const active = await ScanReport.countDocuments({ status: { $in: ['running', 'uploaded'] }, 'origin.kind': 'demo' });
    if (active >= 3) throw new ApiError(429, 'The demo is busy right now. Please try again in a minute');
    return;
  }
  const running = await ScanReport.countDocuments({ user: user._id, status: { $in: ['running', 'uploaded'] } });
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
  const userId = user?._id;
  const files = [];
  for (const f of demoFiles()) {
    const buffer = Buffer.from(f.content, 'utf8');
    files.push(await saveFile({ originalname: f.name, mimetype: 'text/plain', size: buffer.length, buffer }, userId || 'demo'));
  }
  const report = await ScanReport.create({
    user: userId,
    name: 'Demo: vulnerable app',
    files,
    status: 'uploaded',
    origin: { kind: 'demo' },
    expiresAt: demoExpiresAt(),
  });
  await startScan(report);
  return report;
}

/**
 * Judge demo from a GitHub link: downloads a repository and scans it without
 * an account. Same guards as the other demo entries (global concurrent-demo
 * cap, per-IP demoLimiter, uploads auto-deleted after the scan).
 */
export const scanDemoGithub = asyncHandler(async (req, res) => {
  await assertCanScan(req.user, { demo: true });

  let target;
  try {
    target = parseGithubUrl(req.body?.url);
  } catch (err) {
    if (err instanceof GithubError) throw new ApiError(err.status, err.message);
    throw err;
  }

  let zip;
  try {
    zip = await downloadRepoZip({ owner: target.owner, repo: target.repo, branch: target.branch, token: '', maxBytes: DEMO_MAX_BYTES });
  } catch (err) {
    if (err instanceof GithubError) throw new ApiError(err.status, err.message);
    throw err;
  }

  const userId = req.user?._id;
  const file = await saveFile(
    { originalname: `${zip.repo}.zip`, mimetype: 'application/zip', size: zip.buffer.length, buffer: zip.buffer },
    userId || 'demo'
  );
  const report = await ScanReport.create({
    user: userId,
    name: `${zip.owner}/${zip.repo}${zip.branch ? ` (${zip.branch})` : ''}`.slice(0, 120),
    files: [file],
    status: 'uploaded',
    origin: { kind: 'demo', owner: zip.owner, repo: zip.repo, branch: zip.branch, private: false },
    expiresAt: demoExpiresAt(),
  });
  await startScan(report);
  res.status(202).json({ report });
});

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
 * Judge demo with the visitor's own code: up to 10 files (or a zip) scanned
 * without an account. Same guards as the one-click demo: the global
 * concurrent-demo cap, the per-IP demoLimiter, and uploads auto-deleted
 * after the scan. Uploaded code is only ever read as text, never executed.
 */
export const scanDemoUpload = asyncHandler(async (req, res) => {
  await assertCanScan(req.user, { demo: true });
  if (!req.files || req.files.length === 0) throw new ApiError(400, 'Choose at least one code file to scan');
  if (req.files.length > DEMO_MAX_FILES) {
    throw new ApiError(400, `You selected ${req.files.length} files — the demo scans up to ${DEMO_MAX_FILES}. Remove some or send a zip instead`);
  }
  const totalBytes = req.files.reduce((n, f) => n + (f.size || 0), 0);
  if (totalBytes > DEMO_MAX_BYTES) {
    throw new ApiError(413, 'Those files total over 10MB. The demo scans up to 10MB — try a smaller set or a zip of just your source files');
  }

  const userId = req.user?._id;
  const files = [];
  for (const file of req.files) {
    files.push(await saveFile(file, userId || 'demo'));
  }
  const name = (req.body.name || '').trim().slice(0, 120) || files[0].originalName;
  const report = await ScanReport.create({
    user: userId,
    name,
    files,
    status: 'uploaded',
    origin: { kind: 'demo' },
    expiresAt: demoExpiresAt(),
  });
  await startScan(report);
  res.status(202).json({ report });
});

/**
 * Public demo result polling for visitors without an account (hackathon
 * judges). Only demo-origin reports are reachable here, and the owner id is
 * stripped so anonymous reports cannot be tied back to anyone.
 */
/**
 * AI remediation: returns a Gemini-written patch for one finding's saved
 * snippet. Authenticated and owner-scoped (findOwned), so anonymous demo
 * reports are unreachable here. Uses the per-user scanLimiter (AI costs
 * money) and never executes the code — the patch is only returned.
 */
export const remediateFinding = asyncHandler(async (req, res) => {
  const report = await findOwned(req);
  const findingId = String(req.body?.findingId || '').trim();
  if (!findingId) throw new ApiError(400, 'findingId is required');
  const finding = report.findings.id(findingId);
  if (!finding) throw new ApiError(404, 'Finding not found in this report');
  const patch = await getRemediationPatch({
    finding: finding.toObject(),
    apiKey: env.ai.apiKey,
    model: env.ai.model || 'gemini-2.0-flash',
  });
  res.json({ findingId: String(finding._id), patchedCode: patch.patchedCode, explanation: patch.explanation });
});

export const getDemoScan = asyncHandler(async (req, res) => {
  const report = await ScanReport.findOne({ _id: req.params.id, 'origin.kind': 'demo' });
  if (!report) throw new ApiError(404, 'Demo scan not found');
  res.json({ report: toPublicDemoReport(report) });
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
