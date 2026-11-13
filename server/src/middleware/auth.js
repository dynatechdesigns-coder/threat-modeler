import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/jwt.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required');

  const payload = verifyToken(token); // throws JsonWebTokenError -> handled in error middleware
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'User no longer exists');

  // A password reset or change signs every device out: tokens issued before it are no longer accepted.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new ApiError(401, 'Your password was changed. Please sign in again');
  }

  req.user = user;
  next();
});
