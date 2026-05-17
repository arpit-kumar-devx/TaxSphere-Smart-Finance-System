import { Response } from 'express';
import { body } from 'express-validator';
import Transaction from './Transaction.model';
import { AuthedRequest } from '../auth/auth';
import { io } from '../../server';
import mongoose, { Types } from 'mongoose';

export const validateTransaction = [
  body('type').isIn(['income', 'expense']).withMessage('type must be income|expense'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be >= 0'),
  body('category').isString().trim().notEmpty().withMessage('category is required'),
  body('description').optional().isString().trim(),
  body('date').isISO8601().withMessage('date must be ISO8601').toDate(),
];

function toNumber(n: any, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}
function toObjectId(id: string): Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message });
}

export const getTransactions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const rawPage  = (req.query.page  ?? 1) as any;
    const rawLimit = (req.query.limit ?? 10) as any;
    const page  = Math.max(1, toNumber(rawPage, 1));
    const limit = Math.min(100, Math.max(1, toNumber(rawLimit, 10)));

    const type      = req.query.type as 'income' | 'expense' | undefined;
    const category  = req.query.category as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate   = req.query.endDate as string | undefined;
    const search    = (req.query.search as string | undefined) ?? undefined;
    const sortByRaw = (req.query.sortBy as string | undefined) ?? undefined;
    const sortOrderRaw = (req.query.sortOrder as string | undefined) ?? (req.query.sortDir as string | undefined);

    const filter: any = { userId };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   filter.date.$lte = new Date(endDate);
    }

    // Basic search across description + category (case-insensitive)
    if (search && String(search).trim()) {
      const q = String(search).trim();
      // Escape regex special chars to avoid ReDoS / unexpected patterns
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ description: rx }, { category: rx }];
    }

    // Sorting (allowlist only)
    const sortBy = (sortByRaw === 'amount' || sortByRaw === 'createdAt' || sortByRaw === 'date')
      ? sortByRaw
      : 'date';
    const sortOrder = (String(sortOrderRaw || '').toLowerCase() === 'asc') ? 1 : -1;
    const sort: any = { [sortBy]: sortOrder };
    // Stable tie-breakers
    if (sortBy !== 'createdAt') sort.createdAt = -1;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      message: 'Transactions fetched',
      data: transactions,
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (err) {
    console.error('[transactions.get]', err);
    sendError(res, 500, 'Failed to fetch transactions');
  }
};

export const getRecentTransactions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, 'Access token required');
      return;
    }

    const userId = toObjectId(req.user.id);
    if (!userId) {
      sendError(res, 400, 'Invalid user id');
      return;
    }

    const limitRaw = Number(req.query.limit ?? 10);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 10, 100));

    const q: any = { userId };
    const { startDate, endDate } = req.query as any;
    if (startDate || endDate) {
      q.date = {};
      if (startDate) q.date.$gte = new Date(String(startDate));
      if (endDate) q.date.$lte = new Date(String(endDate));
    }

    const docs = await Transaction.find(q)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const transactions = docs.map((tx) => ({
      _id: tx._id,
      type: tx.type,
      amount: Number(tx.amount || 0),
      category: tx.category || 'General',
      description: tx.description || (tx.type === 'income' ? 'Income' : 'Expense'),
      date: tx.date,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    }));

    res.json({ success: true, message: 'Recent transactions fetched', data: transactions, transactions });
  } catch (err) {
    console.error('[transactions.recent]', err);
    sendError(res, 500, 'Failed to fetch recent transactions');
  }
};

export const getExpenseTransactions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, 'Access token required');
      return;
    }

    const userId = toObjectId(req.user.id);
    if (!userId) {
      sendError(res, 400, 'Invalid user id');
      return;
    }

    const limitRaw = Number(req.query.limit ?? 1000);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 1000, 5000));

    const rows = await Transaction.find({ userId, type: 'expense' })
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const data = rows.map((tx) => ({
      _id: tx._id,
      category: tx.category || 'Uncategorized',
      amount: Number(tx.amount || 0),
      date: tx.date,
      description: tx.description || undefined,
    }));

    res.json({ success: true, message: 'Expense analytics fetched', data });
  } catch (err) {
    console.error('[transactions.expenses]', err);
    sendError(res, 500, 'Failed to fetch expense analytics data');
  }
};

export const getTransactionById = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const { id } = req.params;
    const _id = toObjectId(id);
    if (!_id) { sendError(res, 400, 'Invalid transaction id'); return; }

    const tx = await Transaction.findOne({ _id, userId }).lean();
    if (!tx) { sendError(res, 404, 'Transaction not found'); return; }
    res.json({ success: true, message: 'Transaction fetched', data: tx, transaction: tx });
  } catch (err) {
    console.error('[transactions.getById]', err);
    sendError(res, 500, 'Failed to fetch transaction');
  }
};

export const createTransaction = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const payload = {
      userId,
      type: String(req.body.type),
      amount: Number(req.body.amount),
      category: String(req.body.category),
      description: (req.body.description != null ? String(req.body.description) : undefined),
      date: req.body.date instanceof Date ? req.body.date : new Date(String(req.body.date)),
    };

    const tx = await Transaction.create(payload);

    io.emit('transactionAdded', {
      _id: tx._id,
      userId,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      description: tx.description,
      date: tx.date,
      createdAt: tx.createdAt,
    });
    io.emit('transaction_update', { userId: userId.toString(), reason: 'transactionAdded' });

    // Trigger budget & analytics refresh for real-time sync
    io.emit('budgetRefresh', { userId: userId.toString(), reason: 'transactionAdded' });
    io.emit('analyticsRefresh', { userId: userId.toString(), reason: 'transactionAdded' });

    res.status(201).json({ success: true, message: 'Transaction created', data: tx, transaction: tx });
  } catch (err) {
    console.error('[transactions.create]', err);
    sendError(res, 500, 'Failed to create transaction');
  }
};

export const updateTransaction = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const { id } = req.params;
    const _id = toObjectId(id);
    if (!_id) { sendError(res, 400, 'Invalid transaction id'); return; }

    const patch: any = {};
    if (req.body.type != null)        patch.type = String(req.body.type);
    if (req.body.amount != null)      patch.amount = Number(req.body.amount);
    if (req.body.category != null)    patch.category = String(req.body.category);
    if (req.body.description != null) patch.description = String(req.body.description);
    if (req.body.date != null) {
      patch.date = req.body.date instanceof Date ? req.body.date : new Date(String(req.body.date));
    }

    const tx = await Transaction.findOneAndUpdate(
      { _id, userId },
      patch,
      { new: true, runValidators: true }
    ).lean();

    if (!tx) { sendError(res, 404, 'Transaction not found'); return; }

    io.emit('transactionUpdated', {
      _id: tx._id,
      userId,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      description: tx.description,
      date: tx.date,
      createdAt: tx.createdAt,
    });
    io.emit('transaction_update', { userId: userId.toString(), reason: 'transactionUpdated' });

    // Trigger budget & analytics refresh for real-time sync
    io.emit('budgetRefresh', { userId: userId.toString(), reason: 'transactionUpdated' });
    io.emit('analyticsRefresh', { userId: userId.toString(), reason: 'transactionUpdated' });

    res.json({ success: true, message: 'Transaction updated', data: tx, transaction: tx });
  } catch (err) {
    console.error('[transactions.update]', err);
    sendError(res, 500, 'Failed to update transaction');
  }
};

export const deleteTransaction = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const { id } = req.params;
    const _id = toObjectId(id);
    if (!_id) { sendError(res, 400, 'Invalid transaction id'); return; }

    const deleted = await Transaction.findOneAndDelete({ _id, userId }).lean();
    if (!deleted) { sendError(res, 404, 'Transaction not found'); return; }

    console.log(`[transactions.delete] user=${userId.toString()} _id=${_id.toString()} -> deleted`);
    io.emit('transactionDeleted', { _id, userId });
    io.emit('transaction_update', { userId: userId.toString(), reason: 'transactionDeleted' });

    // Trigger budget & analytics refresh for real-time sync
    io.emit('budgetRefresh', { userId: userId.toString(), reason: 'transactionDeleted' });
    io.emit('analyticsRefresh', { userId: userId.toString(), reason: 'transactionDeleted' });
    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (err) {
    console.error('[transactions.delete]', err);
    sendError(res, 500, 'Failed to delete transaction');
  }
};

export const deleteAllTransactions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { sendError(res, 401, 'Unauthorized'); return; }
    const userId = toObjectId(req.user.id);
    if (!userId) { sendError(res, 400, 'Invalid user id'); return; }

    const result = await Transaction.deleteMany({ userId });
    const deletedCount = result.deletedCount || 0;
    console.log(`[transactions.deleteAll] user=${userId.toString()} -> deletedCount=${deletedCount}`);
    io.emit('transaction_update', { userId: userId.toString(), reason: 'transactionDeletedAll' });
    io.emit('analyticsRefresh', { userId: userId.toString(), reason: 'transactionDeletedAll' });
    io.emit('budgetRefresh', { userId: userId.toString(), reason: 'transactionDeletedAll' });
    res.json({ success: true, message: 'All transactions deleted', deletedCount });
  } catch (err) {
    console.error('[transactions.deleteAll]', err);
    sendError(res, 500, 'Failed to delete all transactions');
  }
};
