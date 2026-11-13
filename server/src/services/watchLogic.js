import crypto from 'node:crypto';
import { compareScans } from './compare.js';

// Pure helpers for "scan on every push". No database and no network in here, so they are easy to test.

export const newId = () => crypto.randomBytes(18).toString('base64url');
export const isWebhookId = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);

/** GitHub signs every delivery: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(secret, raw body). */
export function verifySignature(secret, rawBody, header) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let given;
  try {
    given = Buffer.from(header.slice(7), 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Pulls out what we need from a GitHub "push" payload. */
export function parsePush(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const ref = typeof p.ref === 'string' ? p.ref : '';
  const sha = typeof p.after === 'string' ? p.after : '';
  const message = String(p.head_commit?.message || '').split('\n')[0].slice(0, 140);
  return {
    ref,
    branch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : '',
    sha,
    deleted: Boolean(p.deleted) || /^0+$/.test(sha),
    defaultBranch: String(p.repository?.default_branch || ''),
    fullName: String(p.repository?.full_name || ''),
    message,
    author: String(p.head_commit?.author?.name || p.pusher?.name || '').slice(0, 80),
  };
}

/** Is this push for the repository and branch the person chose? (No branch chosen means the default branch.) */
export function pushMatches(watch, push) {
  if (push.fullName.toLowerCase() !== `${watch.owner}/${watch.repo}`.toLowerCase()) return { ok: false, reason: 'Wrong repository' };
  if (push.deleted) return { ok: false, reason: 'Branch deleted' };
  if (!push.branch) return { ok: false, reason: 'Not a branch push' };
  const wanted = watch.branch || push.defaultBranch;
  if (push.branch !== wanted) return { ok: false, reason: `Ignored branch ${push.branch}` };
  if (!/^[0-9a-f]{40}$/i.test(push.sha)) return { ok: false, reason: 'Missing commit id' };
  return { ok: true };
}

/**
 * Decides what to tell the person after a push scan, by comparing with the previous scan of the same repository.
 * status: baseline (first scan), ok (no new problems), warning (the change added problems).
 */
export function evaluateScan(previous, current) {
  const riskScore = current?.riskScore || 0;
  if (!previous) return { status: 'baseline', newCount: 0, newSevere: 0, fixedCount: 0, riskScore, scoreChange: 0, newTitles: [] };
  const diff = compareScans(previous, current);
  const severe = diff.added.filter((f) => f.severity === 'critical' || f.severity === 'high');
  return {
    status: diff.added.length ? 'warning' : 'ok',
    newCount: diff.added.length,
    newSevere: severe.length,
    fixedCount: diff.fixed.length,
    riskScore,
    scoreChange: diff.scoreChange,
    newTitles: diff.added.slice(0, 5).map((f) => `${f.title}${f.file ? ` (${f.file})` : ''}`.slice(0, 160)),
  };
}
