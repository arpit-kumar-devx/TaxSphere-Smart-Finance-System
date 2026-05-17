import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthedRequest } from '../auth/auth';
import Transaction from '../transaction/Transaction.model';
import Budget from '../budget/budget.model';
import Itr from '../itr/itr.model';

// ---------------- helpers ----------------
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');

const monthRange = (year: number, month1to12: number) => {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 1); // exclusive
  return { start, end };
};

const quarterRange = (year: number, q1to4: number) => {
  const startMonth = (q1to4 - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 1); // exclusive
  return { start, end };
};

const yearRange = (year: number) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1); // exclusive
  return { start, end };
};

// ---------------- handlers ----------------
export const getDashboardData = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = new Types.ObjectId(req.user.id);

    // Fetch all-time totals for the dashboard cards as requested
    const allTimeTotals = await Transaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);

    const income = Number(allTimeTotals.find(r => r._id === 'income')?.total || 0);
    const expense = Number(allTimeTotals.find(r => r._id === 'expense')?.total || 0);

    // BUG FIX: tax = max((income - expense) * 0.1, 0)
    // Using Number() explicitly and Math.max to avoid high/incorrect values
    const tax = Math.max((income - expense) * 0.1, 0);
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

    // Keep month/year logic for the charts/breakdown if needed, but the main cards use all-time now
    const { month, year } = req.query;
    const currentMonth = month ? parseInt(month as string, 10) : new Date().getMonth() + 1;
    const currentYear = year ? parseInt(year as string, 10) : new Date().getFullYear();
    const { start, end } = monthRange(currentYear, currentMonth);

    // Expense breakdown (pie) for current month/view
    const breakdown = await Transaction.aggregate([
      { $match: { userId, type: 'expense', date: { $gte: start, $lt: end } } },
      { $group: { _id: '$category', amount: { $sum: '$amount' } } },
      { $project: { _id: 0, category: '$_id', amount: 1 } },
      { $sort: { amount: -1 } },
    ]);

    // Recent transactions
    const recentTransactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    // Latest ITR status
    const latestItr = await Itr.findOne({ userId }).sort({ updatedAt: -1 }).lean();
    const itrStatus = latestItr?.status ?? 'None';

    console.log(`[Dashboard] User: ${userId}, Income: ${income}, Expense: ${expense}, Tax: ${tax}`);

    res.json({
      income: round2(income),
      expense: round2(expense),
      tax: round2(tax),
      savingsRate: round2(savingsRate),
      itrStatus,
      breakdown: { byCategory: breakdown },
      recentTransactions,
      // Metadata for chart
      chartData: {
        income: round2(income),
        expense: round2(expense),
      },
    });
  } catch (error) {
    console.error('[Dashboard Error]', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export const getDashboardSummary = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Access token required' });
      return;
    }
    const userId = new Types.ObjectId(req.user.id);

    const now = new Date();
    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : now;

    const safeStart = Number.isFinite(startDate.getTime()) ? startDate : new Date(now.getFullYear(), now.getMonth(), 1);
    const safeEnd = Number.isFinite(endDate.getTime()) ? endDate : now;
    const normalizedEnd = safeEnd > safeStart ? safeEnd : now;

    const rangeMs = Math.max(24 * 60 * 60 * 1000, normalizedEnd.getTime() - safeStart.getTime());
    const prevStart = new Date(safeStart.getTime() - rangeMs);
    const prevEnd = new Date(safeStart.getTime());

    const [currentTotals, previousTotals, recentTransactions, byCategory, monthlyRows, latestItr] = await Promise.all([
      Transaction.aggregate([
        { $match: { userId, date: { $gte: safeStart, $lte: normalizedEnd } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { userId, date: { $gte: prevStart, $lt: prevEnd } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      Transaction.find({ userId, date: { $gte: safeStart, $lte: normalizedEnd } })
        .sort({ date: -1, createdAt: -1 })
        .limit(10)
        .lean(),
      Transaction.aggregate([
        { $match: { userId, type: 'expense', date: { $gte: safeStart, $lte: normalizedEnd } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
        { $project: { _id: 0, category: '$_id', amount: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { userId, type: 'expense', date: { $gte: safeStart, $lte: normalizedEnd } } },
        { $project: { ym: { $dateToString: { format: '%Y-%m', date: '$date' } }, amount: 1 } },
        { $group: { _id: '$ym', total: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Itr.findOne({ userId }).sort({ updatedAt: -1 }).lean(),
    ]);

    const currentIncome = Number(currentTotals.find((t) => t._id === 'income')?.total || 0);
    const currentExpenses = Number(currentTotals.find((t) => t._id === 'expense')?.total || 0);
    const prevIncome = Number(previousTotals.find((t) => t._id === 'income')?.total || 0);
    const prevExpenses = Number(previousTotals.find((t) => t._id === 'expense')?.total || 0);

    const netSavings = currentIncome - currentExpenses;
    const estimatedTax = Math.max(netSavings * 0.1, 0);
    const savingsRate = currentIncome > 0 ? (netSavings / currentIncome) * 100 : 0;

    const incomeTrend = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : currentIncome > 0 ? 100 : 0;
    const expenseTrend = prevExpenses > 0 ? ((currentExpenses - prevExpenses) / prevExpenses) * 100 : currentExpenses > 0 ? 100 : 0;
    const prevSavings = prevIncome - prevExpenses;
    const savingsTrend = prevSavings !== 0 ? ((netSavings - prevSavings) / Math.abs(prevSavings)) * 100 : netSavings > 0 ? 100 : 0;

    const monthlyTrend = monthlyRows.map((row) => ({
      month: row._id,
      amount: Number(row.total || 0),
    }));

    res.json({
      success: true,
      data: {
        totalIncome: round2(currentIncome),
        totalExpenses: round2(currentExpenses),
        netSavings: round2(netSavings),
        estimatedTax: round2(estimatedTax),
        savingsRate: round2(savingsRate),
        monthlyCashFlow: round2(netSavings),
        itrStatus: latestItr?.status ?? 'draft',
        trend: {
          incomePct: round2(incomeTrend),
          expensePct: round2(expenseTrend),
          savingsPct: round2(savingsTrend),
        },
        recentTransactions,
        expenseDistribution: byCategory,
        monthlyTrend,
      },
    });
  } catch (error) {
    console.error('[dashboard.summary] error', error);
    res.status(500).json({ message: 'Failed to fetch dashboard summary' });
  }
};

/**
 * GET /api/v1/dashboard/income-vs-expenses
 */
export const getIncomeVsExpenses = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = new Types.ObjectId(req.user.id);

    const qPeriod = (req.query.period as string) || (req.query.range as string) || 'month';
    const period: 'month' | 'quarter' | 'year' =
      qPeriod === 'quarter' ? 'quarter' : qPeriod === 'year' ? 'year' : 'month';

    const now = new Date();
    const qMonth = req.query.month ? parseInt(req.query.month as string, 10) : (now.getMonth() + 1);
    const qYear  = req.query.year  ? parseInt(req.query.year  as string, 10) : now.getFullYear();

    let start: Date, end: Date;
    let labels: string[] = [];

    if (period === 'month') {
      ({ start, end } = monthRange(qYear, qMonth));
      const rows = await Transaction.aggregate([
        { $match: { userId, date: { $gte: start, $lt: end } } },
        {
          $project: {
            amount: 1,
            type: 1,
            dayKey: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          }
        },
        { $group: { _id: { dayKey: '$dayKey', type: '$type' }, total: { $sum: '$amount' } } }
      ]);

      const incomeMap = new Map<string, number>();
      const expenseMap = new Map<string, number>();
      for (const r of rows) {
        const k = r._id.dayKey as string;
        if (r._id.type === 'income') incomeMap.set(k, r.total);
        if (r._id.type === 'expense') expenseMap.set(k, r.total);
      }

      const incomeSeries: number[] = [];
      const expenseSeries: number[] = [];
      const cur = new Date(start);

      while (cur < end) {
        const key = cur.toISOString().slice(0, 10); // YYYY-MM-DD
        labels.push(cur.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }));
        incomeSeries.push(round2(incomeMap.get(key) || 0));
        expenseSeries.push(round2(expenseMap.get(key) || 0));
        cur.setDate(cur.getDate() + 1);
      }

      res.json({
        labels,
        series: [
          { label: 'Income', data: incomeSeries },
          { label: 'Expenses', data: expenseSeries }
        ],
        period
      });
      return;
    }

    if (period === 'quarter') {
      const q = Math.ceil(qMonth / 3);
      const qr = quarterRange(qYear, q);
      start = qr.start; end = qr.end;
    } else {
      const yr = yearRange(qYear);
      start = yr.start; end = yr.end;
    }

    const rows = await Transaction.aggregate([
      { $match: { userId, date: { $gte: start, $lt: end } } },
      {
        $project: {
          amount: 1,
          type: 1,
          ym: { $dateToString: { format: '%Y-%m', date: '$date' } }
        }
      },
      { $group: { _id: { ym: '$ym', type: '$type' }, total: { $sum: '$amount' } } }
    ]);

    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const r of rows) {
      const k = r._id.ym as string;
      if (r._id.type === 'income') incomeMap.set(k, r.total);
      if (r._id.type === 'expense') expenseMap.set(k, r.total);
    }

    const incomeSeries: number[] = [];
    const expenseSeries: number[] = [];
    const cur = new Date(start);

    while (cur < end) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const ym = `${y}-${pad2(m)}`;

      labels.push(new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
      incomeSeries.push(round2(incomeMap.get(ym) || 0));
      expenseSeries.push(round2(expenseMap.get(ym) || 0));

      cur.setMonth(cur.getMonth() + 1);
    }

    res.json({
      labels,
      series: [
        { label: 'Income', data: incomeSeries },
        { label: 'Expenses', data: expenseSeries }
      ],
      period
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch income vs expenses data' });
  }
};

// ---------------- Recent transactions endpoint ----------------
export const getRecentTransactions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = new Types.ObjectId(req.user.id);

    const limitRaw = Number(req.query.limit ?? 8);
    const limit = Math.max(1, Math.min(isFinite(limitRaw) ? limitRaw : 8, 100));

    const { startDate, endDate } = req.query as any;
    const q: any = { userId };

    if (startDate || endDate) {
      q.date = {};
      if (startDate) q.date.$gte = new Date(String(startDate));
      if (endDate)   q.date.$lte = new Date(String(endDate));
    }

    const docs = await Transaction.find(q)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const transactions = docs.map(d => ({
      _id: String(d._id),
      user_id: String(d.userId),
      type: d.type as 'income' | 'expense',
      category: (d as any).category ?? 'General',
      amount: Number((d as any).amount),
      date: d.date,
      description:
        (d as any).description ?? (d as any).source ?? (d.type === 'income' ? 'Income' : 'Expense'),
      createdAt: (d as any).createdAt,
      updatedAt: (d as any).updatedAt,
    }));

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
};
