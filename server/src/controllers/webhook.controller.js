import { WatchedRepo } from '../models/WatchedRepo.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isWebhookId, verifySignature, parsePush, pushMatches } from '../services/watchLogic.js';
import { processPush } from '../services/watchRunner.js';

/**
 * POST /api/webhooks/github/:id (called by GitHub, no sign-in).
 * The only thing that makes a request trustworthy is the signature, so it is checked before anything else happens.
 */
export const githubWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const watch = isWebhookId(id) ? await WatchedRepo.findOne({ webhookId: id }) : null;

  // The same answer for "no such address" and "bad signature", so nobody can probe which addresses exist.
  if (!watch || !verifySignature(watch.secret, req.rawBody, req.get('x-hub-signature-256'))) {
    return res.status(401).json({ success: false, message: 'Invalid webhook' });
  }

  const event = req.get('x-github-event');
  if (event === 'ping') return res.json({ ok: true, message: 'Webhook connected' });
  if (event !== 'push') return res.status(202).json({ ok: true, ignored: `Event "${event}" is not used` });

  const push = parsePush(req.body);
  const match = pushMatches(watch, push);
  if (!match.ok) return res.status(202).json({ ok: true, ignored: match.reason });

  // GitHub gives up after 10 seconds, so answer now and scan in the background.
  res.status(202).json({ ok: true, scanning: push.sha.slice(0, 7) });
  processPush(watch._id, push).catch((err) => console.error('Push scan failed:', err.message));
});
