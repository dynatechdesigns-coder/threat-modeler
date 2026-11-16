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
import { loginLimiter, registerLimiter, forgotLimiter, tokenLimiter, resendLimiter } from '../middleware/rateLimits.js';

const router = Router();
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/google', loginLimiter, googleLogin);
router.post('/demo', loginLimiter, demoLogin);
router.get('/me', protect, me);
router.post('/verify-email', tokenLimiter, verifyEmail);
router.post('/resend-verification', protect, resendLimiter, resendVerification);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', tokenLimiter, resetPassword);
router.patch('/preferences', protect, updatePreferences);

export default router;
