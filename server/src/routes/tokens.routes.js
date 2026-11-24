import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { blockJudge } from '../middleware/judge.js';
import { listTokens, createToken, deleteToken } from '../controllers/apiTokens.controller.js';

const router = Router();
router.use(protect, blockJudge);
router.get('/', listTokens);
router.post('/', createToken);
router.delete('/:id', deleteToken);

export default router;
