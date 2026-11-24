import { ApiError } from '../utils/ApiError.js';

// Hackathon judge sessions may scan and read their own demo reports, but they
// must never reach account-level features: API tokens, watched repositories
// (GitHub connections, push webhooks, email alerts), billing, admin, or
// account settings. Mount after `protect` on those routers.
export function blockJudge(req, _res, next) {
  if (req.isJudge) return next(new ApiError(403, 'Hackathon judge sessions cannot use this feature'));
  next();
}
