import { ScanReport } from '../models/ScanReport.js';
import { getScanner } from './scanner/index.js';
import { readFile, deleteFile } from './storage.service.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { planFor } from './entitlements.js';
import { monthKey } from './plans.js';
import { summarize, calcRiskScore } from '../utils/risk.js';

/**
 * Marks the report as running and executes the scan in the background.
 * Log lines are saved as they happen, so the Active Scan screen shows real progress.
 * NOTE: in-process execution is fine for now. For production, move executeScan into a queue worker.
 */
async function countScan(report) {
  if (report.origin?.kind === 'demo') return;
  const month = monthKey();
  const hit = await User.updateOne({ _id: report.user, 'scanUsage.month': month }, { $inc: { 'scanUsage.count': 1 } });
  if (!hit.matchedCount) await User.updateOne({ _id: report.user }, { $set: { scanUsage: { month, count: 1 } } });
}

export async function startScan(report, opts = {}) {
  await countScan(report);
  report.status = 'running';
  report.startedAt = new Date();
  report.completedAt = undefined;
  report.error = undefined;
  report.findings = [];
  report.aiSummary = undefined;
  report.logs = [];
  await report.save();

  setImmediate(() => {
    executeScan(report._id, opts).catch((err) => console.error('Scan runner crashed:', err));
  });
}

export async function executeScan(reportId, { onComplete } = {}) {
  const report = await ScanReport.findById(reportId);
  if (!report) return;

  // Append log lines to the database in order, without blocking the scanner.
  let chain = Promise.resolve();
  const onLog = (line) => {
    chain = chain
      .then(() => ScanReport.updateOne({ _id: reportId }, { $push: { logs: line } }))
      .catch(() => {});
  };

  try {
    // AI review costs real money, so it belongs to the paid plans.
    // Anonymous judge-demo reports have no owner; they scan with AI on.
    const owner = report.user ? await User.findById(report.user) : null;
    const ai = owner ? planFor(owner).ai : true;
    const result = await getScanner().scan({
      ai,
      reportId: String(reportId),
      files: report.files.map((f) => f.toObject()),
      readFile,
      onLog,
    });
    await chain;

    const summary = summarize(result.findings);
    await ScanReport.updateOne(
      { _id: reportId },
      {
        $set: {
          findings: result.findings,
          logs: result.logs || [],
          summary,
          riskScore: calcRiskScore(summary),
          ...(result.aiSummary ? { aiSummary: result.aiSummary } : {}),
          status: 'completed',
          completedAt: new Date(),
        },
        $unset: { error: 1 },
      }
    );
    await purgeUploads(reportId, report.files);
    await notifyDone(onComplete, reportId);
  } catch (err) {
    await chain;
    await ScanReport.updateOne(
      { _id: reportId },
      { $set: { status: 'failed', error: err.message, completedAt: new Date() } }
    );
    await purgeUploads(reportId, report.files);
    await notifyDone(onComplete, reportId);
  }
}

/** Tells whoever started the scan (for example the push watcher) that it has finished. Never lets that crash the runner. */
async function notifyDone(onComplete, reportId) {
  if (!onComplete) return;
  try {
    await onComplete(reportId);
  } catch (err) {
    console.error('Scan completion hook failed:', err.message);
  }
}

/** Removes the uploaded code from storage. The report keeps the findings and file names, not the code. */
async function purgeUploads(reportId, files) {
  if (!env.deleteUploadsAfterScan) return;
  const results = await Promise.all(files.map((f) => deleteFile(f.key, f.storage).then(() => true, () => false)));
  if (results.every(Boolean)) {
    await ScanReport.updateOne({ _id: reportId }, { $set: { filesDeleted: true } }).catch(() => {});
  }
}

