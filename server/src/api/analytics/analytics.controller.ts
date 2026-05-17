import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthedRequest } from '../auth/auth';
import Transaction from '../transaction/Transaction.model';
import { calculateTax, TaxRegime } from '../../utils/taxCalculator';

function getUserObjectId(req: AuthedRequest): Types.ObjectId | null {
  const uid = (req.user?.userId ?? req.user?.id ?? req.user?._id) as any;
  if (!uid) return null;
  const s = typeof uid === 'string' ? uid : String(uid);
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function ymLabel(d: Date): string {
  // e.g. "Mar 2026"
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function computeTaxDue(totalIncome: number, regime: TaxRegime): number {
  const summary = calculateTax(
    { salary: totalIncome, business: 0, capitalGains: 0, otherIncome: 0 },
    { c80C: 0, c80D: 0, c80E: 0, c80G: 0, nps: 0 },
    regime
  );
  return summary.finalTax;
}

/**
 * GET /api/v1/analytics/summary?month=1..12&year=YYYY&regime=OLD|NEW
 *
 * Returns totals scoped to the requested month window.
 */
export async function getSummary(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const regime = (req.query.regime === 'OLD' ? 'OLD' : 'NEW') as TaxRegime;

    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 2000) {
      res.status(400).json({ message: 'month (1..12) and year (>=2000) are required' });
      return;
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const totals = await Transaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);

    const totalIncome = Number(totals.find((r) => r._id === 'income')?.total || 0);
    const totalExpense = Number(totals.find((r) => r._id === 'expense')?.total || 0);
    const savingsRatePct = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const taxDue = computeTaxDue(Math.max(0, totalIncome), regime);

    const expenseBreakdownByCategory = await Transaction.aggregate([
      { $match: { userId, type: 'expense', date: { $gte: start, $lt: end } } },
      { $group: { _id: '$category', amount: { $sum: '$amount' } } },
      { $project: { _id: 0, category: '$_id', amount: 1 } },
      { $sort: { amount: -1 } },
    ]);

    const responseData = {
      totalIncome,
      totalExpense,
      taxDue,
      savingsRatePct,
      expenseBreakdownByCategory,
    };

    console.log(`[Analytics API - Summary] User: ${userId}, Income: ${totalIncome}, Expense: ${totalExpense}`);

    res.json(responseData);
  } catch (e) {
    console.error('[analytics.summary] error', e);
    res.status(500).json({ message: 'Failed to load analytics summary' });
  }
}

/**
 * GET /api/v1/analytics/monthly?regime=OLD|NEW
 *
 * Rolling last 12 months (including current month).
 */
export async function getMonthly(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const regime = (req.query.regime === 'OLD' ? 'OLD' : 'NEW') as TaxRegime;

    const now = new Date();
    const curMonthStart = monthStart(now);
    const start = addMonths(curMonthStart, -11); // 12 months rolling
    const end = addMonths(curMonthStart, 1);     // exclusive

    const rows = await Transaction.aggregate([
      { $match: { userId, date: { $gte: start, $lt: end } } },
      {
        $project: {
          amount: 1,
          type: 1,
          ym: { $dateToString: { format: '%Y-%m', date: '$date' } },
        },
      },
      { $group: { _id: { ym: '$ym', type: '$type' }, total: { $sum: '$amount' } } },
    ]);

    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const r of rows) {
      const k = String(r._id.ym);
      if (r._id.type === 'income') incomeMap.set(k, Number(r.total || 0));
      if (r._id.type === 'expense') expenseMap.set(k, Number(r.total || 0));
    }

    const labels: string[] = [];
    const incomeSeries: number[] = [];
    const expenseSeries: number[] = [];
    const taxSeries: number[] = [];

    const cur = new Date(start);
    while (cur < end) {
      const y = cur.getUTCFullYear();
      const m = cur.getUTCMonth() + 1;
      const ym = `${y}-${String(m).padStart(2, '0')}`;

      const inc = incomeMap.get(ym) || 0;
      const exp = expenseMap.get(ym) || 0;

      labels.push(ymLabel(new Date(Date.UTC(y, m - 1, 1))));
      incomeSeries.push(inc);
      expenseSeries.push(exp);
      taxSeries.push(computeTaxDue(Math.max(0, inc), regime));

      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    res.json({ labels, incomeSeries, expenseSeries, taxSeries });
  } catch (e) {
    console.error('[analytics.monthly] error', e);
    res.status(500).json({ message: 'Failed to load monthly analytics' });
  }
}

/**
 * GET /api/v1/analytics/category?month=1..12&year=YYYY&top=8
 */
export async function getCategory(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const topRaw = req.query.top != null ? Number(req.query.top) : 8;
    const top = Number.isFinite(topRaw) ? Math.max(1, Math.min(20, topRaw)) : 8;

    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 2000) {
      res.status(400).json({ message: 'month (1..12) and year (>=2000) are required' });
      return;
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const rows = await Transaction.aggregate([
      { $match: { userId, type: 'expense', date: { $gte: start, $lt: end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: top },
      { $project: { _id: 0, category: '$_id', total: 1 } },
    ]);

    res.json({
      categories: rows.map((r) => r.category),
      spentSeries: rows.map((r) => Number(r.total || 0)),
    });
  } catch (e) {
    console.error('[analytics.category] error', e);
    res.status(500).json({ message: 'Failed to load category analytics' });
  }
}

/**
 * GET /api/v1/analytics/overview?startDate=&endDate=
 * Unified payload for premium dashboard widgets.
 */
export async function getOverview(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const now = new Date();
    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : addMonths(monthStart(now), -11);
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : now;

    const safeStart = Number.isFinite(startDate.getTime()) ? startDate : addMonths(monthStart(now), -11);
    const safeEnd = Number.isFinite(endDate.getTime()) ? endDate : now;

    const rows = await Transaction.aggregate([
      { $match: { userId, date: { $gte: safeStart, $lte: safeEnd } } },
      {
        $project: {
          amount: 1,
          type: 1,
          category: 1,
          ym: { $dateToString: { format: '%Y-%m', date: '$date' } },
        },
      },
      {
        $facet: {
          monthly: [{ $group: { _id: { ym: '$ym', type: '$type' }, total: { $sum: '$amount' } } }],
          topCategories: [
            { $match: { type: 'expense' } },
            { $group: { _id: '$category', amount: { $sum: '$amount' } } },
            { $sort: { amount: -1 } },
            { $limit: 8 },
          ],
        },
      },
    ]);

    const monthlyRows = rows[0]?.monthly ?? [];
    const topCategoriesRaw = rows[0]?.topCategories ?? [];

    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const row of monthlyRows) {
      const key = String(row._id.ym);
      if (row._id.type === 'income') incomeMap.set(key, Number(row.total || 0));
      if (row._id.type === 'expense') expenseMap.set(key, Number(row.total || 0));
    }

    const labels: string[] = [];
    const incomeSeries: number[] = [];
    const expenseSeries: number[] = [];
    const taxSeries: number[] = [];
    const cursor = new Date(Date.UTC(safeStart.getUTCFullYear(), safeStart.getUTCMonth(), 1));
    const until = new Date(Date.UTC(safeEnd.getUTCFullYear(), safeEnd.getUTCMonth(), 1));

    while (cursor <= until) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const income = incomeMap.get(key) || 0;
      const expense = expenseMap.get(key) || 0;

      labels.push(ymLabel(new Date(Date.UTC(y, m - 1, 1))));
      incomeSeries.push(round2(income));
      expenseSeries.push(round2(expense));
      taxSeries.push(round2(computeTaxDue(Math.max(0, income), 'NEW')));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const topCategories = topCategoriesRaw.map((row: any) => ({
      category: row._id || 'Uncategorized',
      amount: round2(Number(row.amount || 0)),
    }));

    res.json({
      success: true,
      data: {
        labels,
        incomeSeries,
        expenseSeries,
        taxSeries,
        topCategories,
      },
    });
  } catch (error) {
    console.error('[analytics.overview] error', error);
    res.status(500).json({ message: 'Failed to load analytics overview' });
  }
}

/**
 * GET /api/v1/analytics/user
 * Explicit user-scoped analytics endpoint.
 */
export async function getUserOverview(req: AuthedRequest, res: Response): Promise<void> {
  const role = String(req.user?.role || 'USER').toUpperCase();
  if (role !== 'USER') {
    res.status(403).json({ message: 'USER role required' });
    return;
  }
  await getOverview(req, res);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
