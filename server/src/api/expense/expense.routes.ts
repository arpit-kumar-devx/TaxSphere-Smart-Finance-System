import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../auth/auth';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './expense.controller';

const router = Router();

// Require a valid JWT for all expense routes
router.use(authenticateToken);

// Minimal validator to catch obvious bad inputs early
function validateExpenseBody(req: Request, res: Response, next: NextFunction) {
  const { description, source, amount, category, date } = req.body ?? {};
  
  console.log('[Expense Validation] Received body:', req.body);

  const desc = typeof description === 'string' ? description : (typeof source === 'string' ? source : '');
  if (typeof desc !== 'string' || !desc.trim()) {
    console.error('[Expense Validation] Failed on description/source:', { description, source });
    return res.status(400).json({ message: 'description (or source) is required' });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    console.error('[Expense Validation] Failed on amount:', amount);
    return res.status(400).json({ message: 'amount must be a positive number' });
  }
  if (typeof category !== 'string' || !category.trim()) {
    console.error('[Expense Validation] Failed on category:', category);
    return res.status(400).json({ message: 'category is required' });
  }
  if (!date || Number.isNaN(Date.parse(String(date)))) {
    console.error('[Expense Validation] Failed on date:', date);
    return res.status(400).json({ message: 'date must be a valid ISO date string (yyyy-mm-dd)' });
  }

  return next();
}

// CRUD
router.post('/', validateExpenseBody, createExpense);
router.get('/', listExpenses);

// NOTE: PUT here expects a full, valid expense body (same validator).
// If you want partial updates, switch to PATCH and a lighter validator.
router.put('/:id', validateExpenseBody, updateExpense);

router.delete('/:id', deleteExpense);

export default router;
