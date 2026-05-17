import { Router } from 'express';
import * as ctrl from './FinancialReport.controller';
import { authenticateToken } from '../auth/auth';

const router = Router();

router.use(authenticateToken);

router.get('/dashboard/summary', ctrl.dashboardSummary);
router.get('/dashboard/monthly', ctrl.getMonthlyBreakdown);
router.post('/insights', ctrl.getAIInsights);

// Legacy routes just in case they're used somewhere
router.get('/', ctrl.list);
router.get('/:id', ctrl.byId);
router.post('/generate', ctrl.generate);
router.delete('/:id', ctrl.remove);

export default router;
