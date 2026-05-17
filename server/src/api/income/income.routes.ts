import { Router } from 'express';
import { authenticateToken } from '../auth/auth';
import { createIncome, deleteIncome, listIncomes, updateIncome } from './income.controller';
import { Request, Response, NextFunction } from 'express';

const r = Router();
r.use(authenticateToken);

function validateIncomeBody(req: Request, res: Response, next: NextFunction) {
  const { source, description, amount, category, date } = req.body ?? {};
  const desc = typeof source === 'string' ? source : (typeof description === 'string' ? description : '');

  if (!desc.trim()) return res.status(400).json({ message: 'source (or description) is required' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: 'amount must be a positive number' });
  if (typeof category !== 'string' || !category.trim()) return res.status(400).json({ message: 'category is required' });
  if (date && Number.isNaN(Date.parse(String(date)))) return res.status(400).json({ message: 'date must be a valid ISO date string (yyyy-mm-dd)' });

  return next();
}

r.post('/', validateIncomeBody, createIncome);
r.get('/', listIncomes);
r.put('/:id', updateIncome);
r.delete('/:id', deleteIncome);

export default r;
