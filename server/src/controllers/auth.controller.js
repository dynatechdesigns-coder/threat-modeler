import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { verifyGoogleIdToken } from '../utils/googleAuth.js';
import { emailConfigured, send, appUrl } from '../services/mailer.js';
import { isAdminUser } from '../services/admin.js';
import { verificationEmail, resetEmail } from '../services/email.js';
import { makeToken, hashToken, looksLikeToken, VERIFY_TTL, RESET_TTL } from '../services/tokens.js';

/** The user as the browser sees it, plus whether this server can send email at all. */
const publicUser = (user) => ({
  ...user.toJSON(),
  emailAvailable: emailConfigured(),
  isAdmin: isAdminUser(user, env.adminEmails),
});

const checkNewPassword = (password) => {
  if (typeof password !== 'string') throw new ApiError(400, 'Password must be text');
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (password.length > 72) throw new ApiError(400, 'Password must be 72 characters or fewer');
};

/** Creates a fresh verification link and emails it. Never throws: signing up must not fail because email is down. */
async function sendVerification(user) {
  if (!emailConfigured()) return false;
  try {
    const t = makeToken(VERIFY_TTL);
    await User.updateOne({ _id: user._id }, { $set: { verifyTokenHash: t.hash, verifyTokenExpires: t.expires } });
    await send({ to: user.email, ...verificationEmail({ name: user.name, url: `${appUrl()}/verify-email?token=${t.token}` }) });
    return true;
  } catch (err) {
    console.error('Verification email failed:', err.message);
    return false;
  }
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw new ApiError(400, 'Name, email and password must be text');
  }
  if (!name || !email || !password) throw new ApiError(400, 'Name, email and password are required');
  checkNewPassword(password);

  const exists = await User.findOne({ email: String(email).toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with that email already exists');

  const user = await User.create({ name, email, password });
  sendVerification(user); // in the background
  res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') throw new ApiError(400, 'Email and password must be text');
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (user && !user.password) {
    throw new ApiError(400, 'This account uses Google sign-in. Use the "Continue with Google" button, or choose "Forgot password" to set a password');
  }
  const ok = user && (await user.comparePassword(password));
  if (!ok) throw new ApiError(401, 'Invalid email or password');

  res.json({ token: signToken(user._id), user: publicUser(user) });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export const googleLogin = asyncHandler(async (req, res) => {
  if (!env.googleClientId) throw new ApiError(501, 'Google sign-in is not set up on this server');
  const { credential } = req.body || {};
  if (typeof credential !== 'string' || credential.length > 4096) throw new ApiError(400, 'Missing Google credential');

  let google;
  try {
    google = await verifyGoogleIdToken(credential, { clientId: env.googleClientId });
  } catch {
    throw new ApiError(401, 'Google sign-in failed. Please try again');
  }

  // verifyGoogleIdToken only accepts tokens whose email Google has verified, so this address is confirmed.
  let user = await User.findOne({ $or: [{ googleId: google.sub }, { email: google.email }] }).select('+password');
  if (!user) {
    user = await User.create({
      name: google.name || google.email.split('@')[0],
      email: google.email,
      googleId: google.sub,
      emailVerified: true,
    });
  } else if (!user.googleId) {
    // An email/password account for this address already exists. Google has verified the email belongs to
    // this person, so link it and retire the old password: nobody who registered it first can keep using it.
    user.googleId = google.sub;
    user.password = undefined;
    user.markModified('password');
    user.emailVerified = true;
    user.passwordChangedAt = new Date();
    await user.save();
  } else if (!user.emailVerified) {
    user.emailVerified = true;
    await user.save();
  }
  res.json({ token: signToken(user._id), user: publicUser(user) });
});

/** POST /api/auth/verify-email { token } (public: the link in the email carries the token). */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!looksLikeToken(token)) throw new ApiError(400, 'This link is not valid');

  const user = await User.findOne({ verifyTokenHash: hashToken(token), verifyTokenExpires: { $gt: new Date() } });
  if (!user) throw new ApiError(400, 'This link has expired or was already used. Request a new one from your dashboard');

  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();
  res.json({ success: true });
});

/** POST /api/auth/resend-verification (signed in) */
export const resendVerification = asyncHandler(async (req, res) => {
  if (!emailConfigured()) throw new ApiError(503, 'Email is not set up on this server yet');
  if (req.user.emailVerified) return res.json({ success: true, alreadyVerified: true });
  const sent = await sendVerification(req.user);
  if (!sent) throw new ApiError(502, 'We could not send the email right now. Please try again in a few minutes');
  res.json({ success: true });
});

/**
 * POST /api/auth/forgot-password { email }
 * Always answers the same way, whether or not the account exists, so this cannot be used to find out who has an account.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) throw new ApiError(400, 'Enter your email address');
  if (!emailConfigured()) throw new ApiError(503, 'Password reset by email is not set up on this server yet');

  const answer = { success: true, message: 'If an account exists for that address, we have sent a reset link. It works for 1 hour.' };
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) return res.json(answer);

  const t = makeToken(RESET_TTL);
  await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: t.hash, resetTokenExpires: t.expires } });
  send({ to: user.email, ...resetEmail({ name: user.name, url: `${appUrl()}/reset-password?token=${t.token}` }) }).catch((err) =>
    console.error('Reset email failed:', err.message)
  );
  res.json(answer);
});

/** POST /api/auth/reset-password { token, password } */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!looksLikeToken(token)) throw new ApiError(400, 'This link is not valid');
  checkNewPassword(password);

  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  if (!user) throw new ApiError(400, 'This link has expired or was already used. Ask for a new one');

  user.password = password; // hashed by the model before saving
  user.passwordChangedAt = new Date(); // signs out every device that was signed in before
  user.emailVerified = true; // they just proved they can read this inbox
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ success: true });
});

/** PATCH /api/auth/preferences { emailAlerts } */
export const updatePreferences = asyncHandler(async (req, res) => {
  const { emailAlerts } = req.body || {};
  if (typeof emailAlerts !== 'boolean') throw new ApiError(400, 'emailAlerts must be true or false');
  req.user.emailAlerts = emailAlerts;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});
