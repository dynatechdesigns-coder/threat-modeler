import { ApiToken } from '../models/ApiToken.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashApiToken, looksLikeApiToken } from '../services/apiToken.js';

// For the CI endpoints: signs the request in with a long-lived API token instead of a login session.
export const protectApiToken = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!looksLikeApiToken(token)) throw new ApiError(401, 'A valid API token is required');

  const record = await ApiToken.findOne({ hash: hashApiToken(token) });
  if (!record) throw new ApiError(401, 'This API token is not valid or was revoked');
  const user = await User.findById(record.user);
  if (!user) throw new ApiError(401, 'This API token is not valid or was revoked');

  // Record use at most once a minute, so a busy pipeline does not write to the database on every call.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    ApiToken.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  req.user = user;
  req.apiTokenId = record._id;
  next();
});
