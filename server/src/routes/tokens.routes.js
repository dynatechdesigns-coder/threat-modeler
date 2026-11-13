import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listTokens, createToken, deleteToken } from '../controllers/apiTokens.controller.js';

const router = Router();
router.use(protect);
router.get('/', listTokens);
router.post('/', createToken);
router.delete('/:id', deleteToken);

export default router;
