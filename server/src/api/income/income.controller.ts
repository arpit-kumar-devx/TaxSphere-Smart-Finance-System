import { Response } from 'express';
import { Types } from 'mongoose';
import Income from './Income.model';
import Transaction from '../transaction/Transaction.model';
import { AuthedRequest } from '../auth/auth';

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

export async function createIncome(req: AuthedRequest, res: Response) {
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

    const data = await Income.create({
      userId,
      source,
      amount,
      category,
      date,
      notes: req.body.notes != null ? String(req.body.notes) : undefined,
    });

    // Also sync to Transaction model for dashboard compatibility
    try {
      await Transaction.create({
        userId: data.userId,
        type: 'income',
        category: data.category,
        amount: data.amount,
        date: data.date,
        description: data.source
      });
    } catch (txErr) {
      console.error('Transaction sync error:', txErr);
    }

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('INCOME SAVE ERROR:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function listIncomes(req: AuthedRequest, res: Response) {
  const { from, to, source, category } = req.query as any;

  const userId = getAuthedUserObjectId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const q: any = { userId };
  if (source)   q.source = String(source);
  if (category) q.category = String(category);

  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = toDate(from);
    if (to)   q.date.$lte = toDate(to);
  }

  const items = await Income.find(q).sort({ date: -1, createdAt: -1 }).lean();
  res.json(items);
}

export async function updateIncome(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const body = req.body || {};

  const userId = getAuthedUserObjectId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const patch: any = {};
  if (body.source != null || body.description != null) {
    patch.source = String(body.source ?? body.description ?? '').trim();
  }
  if (body.category != null) patch.category = String(body.category).trim();
  if (body.amount != null)   patch.amount = Number(body.amount);
  if (body.date != null)     patch.date   = toDate(body.date);
  if (body.notes != null)    patch.notes  = String(body.notes || '').trim() || undefined;

  const updated = await Income.findOneAndUpdate(
    { _id: id, userId },
    patch,
    { new: true }
  );

  if (!updated) return res.status(404).json({ message: 'Not found' });

  // (optional) keep Transaction in sync (heuristic)
  await Transaction.findOneAndUpdate(
    {
      userId,
      type: 'income',
      description: updated.source,
      date: updated.date,
      amount: updated.amount
    },
    { category: updated.category },
    { upsert: false }
  );

  res.json(updated);
}

export async function deleteIncome(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const userId = getAuthedUserObjectId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // Use .lean() so we get a plain object with known fields
  const del = await Income.findOneAndDelete({ _id: id, userId }).lean();
  if (!del) return res.status(404).json({ message: 'Not found' });

  // (optional) also remove a matching Transaction (best: store incomeId in Transaction)
  await Transaction.deleteOne({
    userId,
    type: 'income',
    description: del.source,
    amount: del.amount,
    date: del.date
  });

  res.json({ ok: true });
}
