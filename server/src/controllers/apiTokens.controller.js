import { ApiToken } from '../models/ApiToken.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { newApiToken } from '../services/apiToken.js';
import { assertWithinLimit } from '../services/entitlements.js';

export const listTokens = asyncHandler(async (req, res) => {
  res.json({ tokens: await ApiToken.find({ user: req.user._id }).sort({ createdAt: -1 }) });
});

/** The token itself is in this response only. It cannot be shown again. */
export const createToken = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60) || 'CI token';
  await assertWithinLimit(req.user, 'tokens');
  const { token, hash, display } = newApiToken();
  const record = await ApiToken.create({ user: req.user._id, name, hash, display });
  res.status(201).json({ token, record });
});

export const deleteToken = asyncHandler(async (req, res) => {
  const record = await ApiToken.findOne({ _id: req.params.id, user: req.user._id });
  if (!record) throw new ApiError(404, 'Token not found');
  await record.deleteOne();
  res.json({ success: true });
});
