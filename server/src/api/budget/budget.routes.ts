import { Router } from 'express';
import { budgetController } from './budget.controller';
import { authenticateToken } from '../auth/auth';

const router = Router();
router.use(authenticateToken);

// GET /api/v1/budget?month=YYYY-MM
router.get('/', budgetController.getOverview);

// GET /api/v1/budgets/current?month=YYYY-MM
router.get('/current', budgetController.getCurrent);

// GET /api/v1/budgets/category-summary?month=YYYY-MM
router.get('/category-summary', budgetController.getCategorySummary);

// GET /api/v1/budgets/monthly-summary?month=YYYY-MM
router.get('/monthly-summary', budgetController.getMonthlySummary);

// GET /api/v1/budgets/summary?month=YYYY-MM
router.get('/summary', budgetController.getSummary);

// POST /api/v1/budgets  (upsert: creates new or updates existing month)
router.post('/', budgetController.createOrUpdate);

// POST /api/v1/budgets/upsert
router.post('/upsert', budgetController.createOrUpdate);

// POST /api/v1/budgets/create  (legacy compat)
router.post('/create', budgetController.createOrUpdate);

// PUT /api/v1/budgets/:budgetId
router.put('/:budgetId', budgetController.update);

// DELETE /api/v1/budgets/delete/:id  (legacy compat)
router.delete('/delete/:budgetId', budgetController.remove);

// DELETE /api/v1/budgets/:budgetId
router.delete('/:budgetId', budgetController.remove);

export default router;
