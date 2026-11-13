import { ScanReport } from '../models/ScanReport.js';
import { WatchedRepo } from '../models/WatchedRepo.js';
import { downloadRepoZip, GithubError } from './github.js';
import { saveFile } from './storage.service.js';
import { startScan } from './scanRunner.js';
import { evaluateScan } from './watchLogic.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { emailConfigured, send, appUrl } from './mailer.js';
import { pushAlertEmail } from './email.js';
import { planFor, scansThisMonth } from './entitlements.js';
import { scanBlockedReason } from './plans.js';

const MAX_EVENTS = 30;
const MAX_PUSH_SCANS_PER_HOUR = 10;

async function pushEvent(watchId, event) {
  const doc = await WatchedRepo.findByIdAndUpdate(
    watchId,
    { $push: { events: { $each: [event], $slice: -MAX_EVENTS } } },
    { new: true }
  );
  const saved = doc?.events?.[doc.events.length - 1];
  return saved?._id;
}

const patchEvent = (watchId, eventId, fields) => {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) $set[`events.$[e].${k}`] = v;
  return WatchedRepo.updateOne({ _id: watchId }, { $set }, { arrayFilters: [{ 'e._id': eventId }] });
};

/**
 * Handles one push: downloads that exact commit, scans it, compares with the previous scan of this repository and
 * records the result as an "event" the person sees on the Watched repos page.
 * Runs in the background, after GitHub has already been answered.
 */
export async function processPush(watchId, push) {
  const watch = await WatchedRepo.findById(watchId);
  if (!watch) return;

  const base = { sha: push.sha, message: push.message, author: push.author, at: new Date() };

  // Guard rails: scans cost time and AI money, so a burst of pushes cannot run away.
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = watch.events.filter((e) => e.status !== 'skipped' && e.at.getTime() > hourAgo).length;
  const running = await ScanReport.countDocuments({ user: watch.user, status: 'running' });
  if (recent >= MAX_PUSH_SCANS_PER_HOUR || running >= 2) {
    await pushEvent(watchId, {
      ...base,
      status: 'skipped',
      reason: recent >= MAX_PUSH_SCANS_PER_HOUR ? 'Too many pushes in the last hour' : 'Another scan was still running',
    });
    return;
  }

  const owner = await User.findById(watch.user);
  const blocked = owner && scanBlockedReason(planFor(owner), scansThisMonth(owner));
  if (blocked) {
    await pushEvent(watchId, { ...base, status: 'skipped', reason: 'Monthly scan limit reached for your plan' });
    return;
  }

  const eventId = await pushEvent(watchId, { ...base, status: 'scanning' });
  try {
    const zip = await downloadRepoZip({
      owner: watch.owner,
      repo: watch.repo,
      sha: push.sha,
      maxBytes: env.maxUploadMb * 1024 * 1024,
    });
    const file = await saveFile(
      { originalname: `${watch.repo}.zip`, mimetype: 'application/zip', size: zip.buffer.length, buffer: zip.buffer },
      watch.user
    );
    const report = await ScanReport.create({
      user: watch.user,
      name: `${watch.owner}/${watch.repo} @ ${push.sha.slice(0, 7)}`,
      files: [file],
      status: 'uploaded',
    });
    await patchEvent(watchId, eventId, { report: report._id });

    await startScan(report, { onComplete: (reportId) => finishPush(watchId, eventId, reportId) });
  } catch (err) {
    const reason = err instanceof GithubError ? err.message : 'Could not start the scan';
    await patchEvent(watchId, eventId, { status: 'failed', reason });
  }
}

async function finishPush(watchId, eventId, reportId) {
  const [watch, current] = await Promise.all([WatchedRepo.findById(watchId), ScanReport.findById(reportId)]);
  if (!watch || !current) return;

  if (current.status !== 'completed') {
    await patchEvent(watchId, eventId, { status: 'failed', reason: current.error || 'The scan did not finish' });
    return;
  }

  const previous = watch.lastReport ? await ScanReport.findOne({ _id: watch.lastReport, status: 'completed' }) : null;
  const result = evaluateScan(previous?.toObject(), current.toObject());
  await patchEvent(watchId, eventId, { ...result, previousReport: previous?._id });
  await WatchedRepo.updateOne({ _id: watchId }, { $set: { lastReport: current._id } });

  if (result.status === 'warning') await emailAlert(watch, current, result, eventId);
}

/**
 * Emails the owner when a push added problems. Only to verified addresses (so nobody can be spammed by someone who
 * signed up with their address) and only if they have not turned alerts off. Failures are logged, never thrown.
 */
async function emailAlert(watch, report, result) {
  if (!emailConfigured()) return;
  try {
    const user = await User.findById(watch.user);
    if (!user || !user.emailVerified || user.emailAlerts === false) return;
    const event = (await WatchedRepo.findById(watch._id))?.events?.find((e) => String(e.report) === String(report._id));
    await send({
      to: user.email,
      ...pushAlertEmail({
        name: user.name,
        repo: `${watch.owner}/${watch.repo}`,
        sha: event?.sha || '',
        message: event?.message || '',
        newCount: result.newCount,
        newSevere: result.newSevere,
        titles: result.newTitles,
        url: `${appUrl()}/reports/${report._id}`,
      }),
    });
  } catch (err) {
    console.error('Push alert email failed:', err.message);
  }
}

/** Called at startup. A push scan that was running when the server restarted can never finish. */
export async function failInterruptedPushScans() {
  const res = await WatchedRepo.updateMany(
    { 'events.status': 'scanning' },
    { $set: { 'events.$[e].status': 'failed', 'events.$[e].reason': 'The server restarted during this scan' } },
    { arrayFilters: [{ 'e.status': 'scanning' }] }
  );
  return res.modifiedCount || 0;
}
