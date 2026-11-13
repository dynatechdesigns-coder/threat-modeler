import { WatchedRepo } from '../models/WatchedRepo.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseGithubUrl, GithubError } from '../services/github.js';
import { newId } from '../services/watchLogic.js';
import { newShareToken } from '../services/share.js';
import { env } from '../config/env.js';
import crypto from 'node:crypto';
import { assertWithinLimit, planFor } from '../services/entitlements.js';

const webhookUrl = (req, watch) =>
  `${env.publicApiUrl || `${req.protocol}://${req.get('host')}`}/api/webhooks/github/${watch.webhookId}`;

async function findOwned(req) {
  const watch = await WatchedRepo.findOne({ _id: req.params.id, user: req.user._id });
  if (!watch) throw new ApiError(404, 'Watched repository not found');
  return watch;
}

export const listWatches = asyncHandler(async (req, res) => {
  const watches = await WatchedRepo.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ watches });
});

export const createWatch = asyncHandler(async (req, res) => {
  let target;
  try {
    target = parseGithubUrl(req.body?.url);
  } catch (err) {
    if (err instanceof GithubError) throw new ApiError(err.status, err.message);
    throw err;
  }

  const branch = String(req.body?.branch || '').trim();
  if (branch && !/^[A-Za-z0-9._/-]{1,100}$/.test(branch)) throw new ApiError(400, 'That branch name is not valid');

  await assertWithinLimit(req.user, 'watches');
  const chosenBranch = branch || target.branch;
  const exists = await WatchedRepo.findOne({ user: req.user._id, owner: target.owner, repo: target.repo, branch: chosenBranch });
  if (exists) throw new ApiError(409, 'You are already watching this repository');

  const watch = await WatchedRepo.create({
    user: req.user._id,
    owner: target.owner,
    repo: target.repo,
    branch: chosenBranch,
    webhookId: newId(),
    secret: crypto.randomBytes(24).toString('hex'),
  });
  res.status(201).json({ watch, setup: { url: webhookUrl(req, watch), secret: watch.secret } });
});

/** The address and secret the person pastes into GitHub. Only the owner can read them. */
export const getSetup = asyncHandler(async (req, res) => {
  const watch = await findOwned(req);
  res.json({ setup: { url: webhookUrl(req, watch), secret: watch.secret } });
});

export const deleteWatch = asyncHandler(async (req, res) => {
  const watch = await findOwned(req);
  await watch.deleteOne();
  res.json({ success: true });
});

const badgeInfo = (req, watch) => {
  const base = env.publicApiUrl || `${req.protocol}://${req.get('host')}`;
  const image = `${base}/api/public/badge/${watch.badgeToken}`;
  const link = env.appUrl || env.clientOrigins[0] || '';
  return { image, markdown: `[![Threat Modeler](${image})](${link})`, html: `<a href="${link}"><img src="${image}" alt="Threat Modeler"></a>` };
};

/** Switch the public README badge on. Anyone with the address can see the latest risk number, and nothing else. */
export const enableBadge = asyncHandler(async (req, res) => {
  const watch = await findOwned(req);
  if (!planFor(req.user).badge) throw new ApiError(402, 'The README badge is part of the Pro plan. Upgrade on the Billing page');
  if (!watch.badgeToken) {
    watch.badgeToken = newShareToken();
    await watch.save();
  }
  res.json({ badge: badgeInfo(req, watch) });
});

export const disableBadge = asyncHandler(async (req, res) => {
  const watch = await findOwned(req);
  watch.badgeToken = undefined;
  await watch.save();
  res.json({ success: true });
});

export const getBadgeInfo = asyncHandler(async (req, res) => {
  const watch = await findOwned(req);
  res.json({ badge: watch.badgeToken ? badgeInfo(req, watch) : null });
});
