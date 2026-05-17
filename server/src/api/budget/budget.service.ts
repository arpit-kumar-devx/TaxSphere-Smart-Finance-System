import Budget, { IBudget } from './budget.model';
import Transaction from '../transaction/Transaction.model';
import mongoose from 'mongoose';

export type CreateBudgetInput = {
  userId: string;
  month: string;
  totalBudget: number;
  categories: { name: string; limit: number }[];
};

type ExpenseCategoryAggregate = {
  key: string;
  label: string;
  spent: number;
};

type CategorySummaryRow = {
  category: string;
  spent: number;
  limit: number;
  percentage: number;
};

function monthRange(month: string): { startDate: Date; endDate: Date } {
  const [y, m] = month.split('-').map(Number);
  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 1);
  return { startDate, endDate };
}

function normalizeCategoryKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseCategory(value: string): string {
  const cleaned = normalizeCategoryKey(value);
  if (!cleaned) return 'Other';
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function toObjectId(userId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(userId);
}

function monthBefore(month: string): string {
  const [y, m] = month.split('-').map(Number);
  let prevYear = y;
  let prevMonth = m - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

function findBudgetMatch(expenseKey: string, budgetKeys: string[]): string | null {
  if (!expenseKey || !budgetKeys.length) return null;
  if (budgetKeys.includes(expenseKey)) return expenseKey;

  const candidates = budgetKeys
    .filter((k) => expenseKey.includes(k) || k.includes(expenseKey))
    .sort((a, b) => b.length - a.length);

  return candidates[0] || null;
}

export const budgetService = {
  async aggregateExpenseByCategory(userId: string, month: string): Promise<ExpenseCategoryAggregate[]> {
    const { startDate, endDate } = monthRange(month);
    const userOid = toObjectId(userId);

    const rows = await Transaction.aggregate([
      {
        $match: {
          userId: userOid,
          type: 'expense',
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$category', 'Other'] },
          spent: { $sum: '$amount' },
        },
      },
    ]);

    const merged = new Map<string, ExpenseCategoryAggregate>();
    for (const row of rows) {
      const rawLabel = String(row?._id || 'Other').trim() || 'Other';
      const key = normalizeCategoryKey(rawLabel) || 'other';
      const spent = Number(row?.spent || 0);
      if (!Number.isFinite(spent) || spent <= 0) continue;

      const existing = merged.get(key);
      if (existing) {
        existing.spent += spent;
      } else {
        merged.set(key, { key, label: rawLabel, spent });
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.spent - a.spent);
  },

  buildCategorySummaryRows(
    budgetCategories: Array<{ name: string; limit: number }>,
    expenseRows: ExpenseCategoryAggregate[]
  ): CategorySummaryRow[] {
    const budgetRows = (budgetCategories || []).map((c) => ({
      key: normalizeCategoryKey(c.name) || titleCaseCategory(c.name).toLowerCase(),
      category: String(c.name).trim(),
      limit: Number(c.limit || 0),
      spent: 0,
    }));

    const budgetMap = new Map<string, { category: string; limit: number; spent: number }>();
    for (const row of budgetRows) {
      if (!row.key) continue;
      budgetMap.set(row.key, { category: row.category, limit: row.limit, spent: 0 });
    }

    const budgetKeys = Array.from(budgetMap.keys());
    const looseRows = new Map<string, { category: string; spent: number }>();

    for (const exp of expenseRows) {
      const matchKey = findBudgetMatch(exp.key, budgetKeys);
      if (matchKey && budgetMap.has(matchKey)) {
        const matched = budgetMap.get(matchKey)!;
        matched.spent += exp.spent;
      } else {
        const fallbackKey = exp.key || 'other';
        const existing = looseRows.get(fallbackKey);
        if (existing) {
          existing.spent += exp.spent;
        } else {
          looseRows.set(fallbackKey, {
            category: titleCaseCategory(exp.label || exp.key),
            spent: exp.spent,
          });
        }
      }
    }

    const rows: CategorySummaryRow[] = [
      ...Array.from(budgetMap.values()).map((row) => ({
        category: row.category,
        spent: Number(row.spent || 0),
        limit: Number(row.limit || 0),
        percentage: row.limit > 0 ? Math.round((row.spent / row.limit) * 100) : 0,
      })),
      ...Array.from(looseRows.values()).map((row) => ({
        category: row.category,
        spent: Number(row.spent || 0),
        limit: 0,
        percentage: 0,
      })),
    ];

    return rows.sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
  },

  async getCategorySummary(userId: string, month: string): Promise<CategorySummaryRow[]> {
    const [budget, expenseRows] = await Promise.all([
      Budget.findOne({ userId, month }).lean(),
      this.aggregateExpenseByCategory(userId, month),
    ]);

    if (!budget) {
      return expenseRows.map((row) => ({
        category: titleCaseCategory(row.label || row.key),
        spent: Number(row.spent || 0),
        limit: 0,
        percentage: 0,
      }));
    }

    return this.buildCategorySummaryRows(
      (budget.categories || []).map((c) => ({ name: c.name, limit: c.limit })),
      expenseRows
    );
  },

  async getMonthlySummary(userId: string, month: string): Promise<{ currentMonth: number; previousMonth: number }> {
    const calcMonthTotal = async (monthValue: string) => {
      const { startDate, endDate } = monthRange(monthValue);
      const userOid = toObjectId(userId);
      const rows = await Transaction.aggregate([
        {
          $match: {
            userId: userOid,
            type: 'expense',
            date: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]);
      return Number(rows?.[0]?.total || 0);
    };

    const [currentMonth, previousMonth] = await Promise.all([
      calcMonthTotal(month),
      calcMonthTotal(monthBefore(month)),
    ]);

    return { currentMonth, previousMonth };
  },

  /**
   * Upsert a budget document for a given user+month.
   * Spent values are NOT stored — they are computed live from transactions.
   */
  async upsertBudget(input: CreateBudgetInput): Promise<IBudget> {
    const { userId, month, totalBudget, categories } = input;

    const doc = await Budget.findOneAndUpdate(
      { userId, month },
      {
        totalBudget,
        categories: categories.map(c => ({ name: c.name, limit: c.limit, spent: 0 }))
      },
      { new: true, upsert: true, runValidators: true }
    );
    return doc;
  },

  /**
   * Get the current budget for a user+month, with LIVE computed spent
   * values aggregated from the Transaction collection (type='expense').
   */
  async getCurrent(userId: string, month: string) {
    // 1. Get the budget document
    const budget = await Budget.findOne({ userId, month }).lean();
    if (!budget) return null;
    const expenseRows = await this.aggregateExpenseByCategory(userId, month);
    const categorySummary = this.buildCategorySummaryRows(
      (budget.categories || []).map((c) => ({ name: c.name, limit: c.limit })),
      expenseRows
    );
    const computedCategories = categorySummary.map((row) => ({
      name: row.category,
      limit: row.limit,
      spent: row.spent,
    }));
    const totalSpent = categorySummary.reduce((sum, row) => sum + Number(row.spent || 0), 0);

    // 5. Compute derived fields
    const remaining = Math.max(0, budget.totalBudget - totalSpent);
    const savingsRatio = budget.totalBudget > 0
      ? Math.round(((budget.totalBudget - totalSpent) / budget.totalBudget) * 100)
      : (totalSpent > 0 ? 0 : 100);

    return {
      ...budget,
      categories: computedCategories,
      totalSpent,
      remaining,
      savingsRatio
    };
  },

  /**
   * Get a budget summary with additional analytics:
   * totals + category usage + month-over-month trend.
   */
  async getSummary(userId: string, month: string) {
    const [current, monthlyTrend] = await Promise.all([
      this.getCurrent(userId, month),
      this.getMonthlySummary(userId, month),
    ]);

    if (!current) {
      return {
        totalBudget: 0,
        totalAllocated: 0,
        totalSpent: 0,
        remainingBudget: 0,
        categories: [] as Array<{
          name: string;
          limit: number;
          spent: number;
          remaining: number;
          percentage: number;
        }>,
        monthlyTrend,
      };
    }

    const categories = (current.categories || []).map((c) => {
      const limit = Number(c.limit || 0);
      const spent = Number(c.spent || 0);
      const remaining = Math.max(0, limit - spent);
      const percentage = limit > 0 ? Number(((spent / limit) * 100).toFixed(2)) : 0;
      return {
        name: c.name,
        limit,
        spent,
        remaining,
        percentage,
      };
    });

    const totalAllocated = Number(
      categories.reduce((sum, c) => sum + Number(c.limit || 0), 0).toFixed(2)
    );

    return {
      totalBudget: Number(current.totalBudget || 0),
      totalAllocated,
      totalSpent: Number(current.totalSpent || 0),
      remainingBudget: Number(current.remaining || 0),
      categories,
      monthlyTrend,
    };
  },

  async deleteBudget(id: string, userId: string) {
    return Budget.findOneAndDelete({ _id: id, userId });
  },

  async updateBudget(id: string, userId: string, updates: Partial<CreateBudgetInput>) {
    const patch: any = {};
    if (updates.totalBudget !== undefined) patch.totalBudget = updates.totalBudget;
    if (updates.categories) {
      patch.categories = updates.categories.map(c => ({ name: c.name, limit: c.limit, spent: 0 }));
    }

    const doc = await Budget.findOneAndUpdate(
      { _id: id, userId },
      patch,
      { new: true, runValidators: true }
    );
    return doc;
  }
};
