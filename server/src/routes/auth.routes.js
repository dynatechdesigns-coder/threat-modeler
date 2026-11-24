import { Router } from 'express';
import {
  register,
  login,
  me,
  googleLogin,
  demoLogin,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  updatePreferences,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { blockJudge } from '../middleware/judge.js';
import { loginLimiter, registerLimiter, forgotLimiter, tokenLimiter, resendLimiter, demoLoginLimiter } from '../middleware/rateLimits.js';

const router = Router();
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/google', loginLimiter, googleLogin);
router.post('/demo', demoLoginLimiter, demoLogin);
router.get('/me', protect, me);
router.post('/verify-email', tokenLimiter, verifyEmail);
router.post('/resend-verification', protect, blockJudge, resendLimiter, resendVerification);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', tokenLimiter, resetPassword);
router.patch('/preferences', protect, blockJudge, updatePreferences);

export default router;
