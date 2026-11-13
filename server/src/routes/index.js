import { Router } from 'express';
import authRoutes from './auth.routes.js';
import uploadRoutes from './upload.routes.js';
import scanRoutes from './scan.routes.js';
import waitlistRoutes from './waitlist.routes.js';
import linksRoutes from './links.routes.js';
import publicRoutes from './public.routes.js';
import watchRoutes from './watch.routes.js';
import headersRoutes from './headers.routes.js';
import adminRoutes from './admin.routes.js';
import ciRoutes from './ci.routes.js';
import tokensRoutes from './tokens.routes.js';
import billingRoutes from './billing.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/scans', scanRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/links', linksRoutes);
router.use('/public', publicRoutes);
router.use('/watches', watchRoutes);
router.use('/headers', headersRoutes);
router.use('/admin', adminRoutes);
router.use('/ci', ciRoutes);
router.use('/tokens', tokensRoutes);
router.use('/billing', billingRoutes);

export default router;
