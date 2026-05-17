import { Response } from 'express';
import type { AuthedRequest } from '../auth/auth';
import { Types } from 'mongoose';
import Expense from './Expense.model';
import Transaction from '../transaction/Transaction.model';

function toDate(input: any): Date {
  if (!input) return new Date();
  const d = input instanceof Date ? input : new Date(String(input));
  return isNaN(d.getTime()) ? new Date() : d;
}

function getAuthedUserObjectId(req: AuthedRequest): Types.ObjectId | null {
  const uid = (req.user?.userId ?? req.user?.id ?? req.user?._id) as any;
  if (!uid) return null;
  const asStr = typeof uid === 'string' ? uid : String(uid);
  return Types.ObjectId.isValid(asStr) ? new Types.ObjectId(asStr) : null;
}

// A lightweight type for .lean() results of Expense
type ExpenseLean = {
  _id: any;
  userId: any;
  description: string;
  amount: number;
  category: string;
  date: Date;
  notes?: string;
};

export async function createExpense(req: AuthedRequest, res: Response) {
  try {
    console.log('BODY:', req.body);
    console.log('USER:', req.user);

    const userId = getAuthedUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const source = req.body.source || req.body.description || 'Other';
    const amount = Number(req.body.amount);
    const category = typeof req.body.category === 'string' && req.body.category.trim()
      ? req.body.category.trim()
      : 'General';
    const date = toDate(req.body.date);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const data = await Expense.create({
      userId,
      description: source, // this is the underlying DB field, mapped to 'source' alias
      amount,
      category,
      date,
      notes: req.body.notes != null ? String(req.body.notes) : undefined,
    });

    // Also sync to Transaction model for dashboard compatibility
    try {
      await Transaction.create({
        userId: data.userId,
        type: 'expense',
        category: data.category,
        amount: data.amount,
        date: data.date,
        description: data.description
      });
    } catch (txErr) {
      console.error('Transaction sync error:', txErr);
    }

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('EXPENSE SAVE ERROR:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function listExpenses(req: AuthedRequest, res: Response) {
  try {
    const userId = getAuthedUserObjectId(req);
    if (!userId) return res.status(401).json({ message: 'Missing user context' });

    const { from, to, category } = (req.query as any) || {};
    const q: any = { userId };

    if (category) q.category = String(category);
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = toDate(from);
      if (to)   q.date.$lte = toDate(to);
    }

    const items = await Expense.find(q).sort({ date: -1, createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.error('[expense.list]', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function updateExpense(req: AuthedRequest, res: Response) {
  try {
    const userId = getAuthedUserObjectId(req);
    if (!userId) return res.status(401).json({ message: 'Missing user context' });

    const { id } = req.params;

    // Normalize a couple of fields just in case
    const body = { ...req.body };
    if (body.date) body.date = toDate(body.date);
    if (typeof body.description === 'string') body.description = body.description.trim();
    if (typeof body.category === 'string') body.category = body.category.trim();
    if (typeof body.amount !== 'undefined') body.amount = Number(body.amount);

    const updated = await Expense.findOneAndUpdate(
      { _id: id, userId },
      body,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Not found' });

    // (optional) keep Transaction in sync (heuristic)
    await Transaction.findOneAndUpdate(
      {
        userId,
        type: 'expense',
        description: updated.description,
        date: updated.date,
        amount: updated.amount
      },
      { category: updated.category },
      { upsert: false }
    );

    return res.json(updated);
  } catch (err: any) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', errors: err.errors });
    }
    console.error('[expense.update]', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function deleteExpense(req: AuthedRequest, res: Response) {
  try {
    const userId = getAuthedUserObjectId(req);
    if (!userId) return res.status(401).json({ message: 'Missing user context' });

    const { id } = req.params;

    // IMPORTANT: use .lean<ExpenseLean>() so TS knows the fields exist
    const deleted = await Expense.findOneAndDelete({ _id: id, userId })
      .lean<ExpenseLean>()
      .exec();

    if (!deleted) return res.status(404).json({ message: 'Not found' });

    // Remove a matching Transaction (best: store expenseId on Transaction; here we match by fields)
    await Transaction.deleteOne({
      userId,
      type: 'expense',
      description: deleted.description,
      amount: deleted.amount,
      date: deleted.date
    });

    return res.json({ deleted: true, _id: id });
  } catch (err) {
    console.error('[expense.delete]', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
