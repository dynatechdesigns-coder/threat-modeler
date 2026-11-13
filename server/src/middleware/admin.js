import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { isAdminUser } from '../services/admin.js';

// Use after `protect`.
export function requireAdmin(req, _res, next) {
  if (!isAdminUser(req.user, env.adminEmails)) return next(new ApiError(403, 'Admins only'));
  next();
}
