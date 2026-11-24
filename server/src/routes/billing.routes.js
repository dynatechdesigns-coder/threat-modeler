import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { blockJudge } from '../middleware/judge.js';
import { getPlans, getMyBilling, startCheckout, verifyCheckout, cancelPlan } from '../controllers/billing.controller.js';

const router = Router();
router.get('/plans', getPlans);
router.use(protect, blockJudge);
router.get('/me', getMyBilling);
router.post('/checkout', startCheckout);
router.post('/verify', verifyCheckout);
router.post('/cancel', cancelPlan);

export default router;
