import { Router } from 'express';
import { authenticateToken, AuthedRequest } from '../auth/auth';
import { Response, NextFunction } from 'express';
import {
  listAssigned,
  getOne,
  reviewDocument,
  startReview,
  updateStatus,
  getProfile,
  updateProfile,
  analyticsOverview,
} from './ca.controller';

const router = Router();

// Middleware: only allow CA role
function requireCA(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'CA') {
    return res.status(403).json({ message: 'CA role required' });
  }
  next();
}

// All CA routes require auth + CA role
router.use(authenticateToken, requireCA as any);

// ITR management
router.get('/assigned-itrs', listAssigned as any);
router.get('/dashboard', listAssigned as any);
router.get('/itr/:id', getOne as any);
router.patch('/itr/:itrId/documents/:docId/review', reviewDocument as any);
router.patch('/itr/:id/document/:docId/status', reviewDocument as any);
router.patch('/itr/:id/start-review', startReview as any);
router.patch('/itr/:id/status', updateStatus as any);
router.post('/itr/:id/remarks', updateStatus as any);

// CA profile
router.get('/profile', getProfile as any);
router.put('/profile', updateProfile as any);
router.get('/analytics/overview', analyticsOverview as any);
router.get('/analytics', analyticsOverview as any);

export default router;
