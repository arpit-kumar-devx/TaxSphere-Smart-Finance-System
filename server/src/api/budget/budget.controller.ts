import { Request, Response } from 'express';
import { budgetService } from './budget.service';
import { io } from '../../server';

function getUserId(req: Request): string | undefined {
  const user = (req as any).user;
  if (user?.id) return String(user.id);
  if (user?.userId) return String(user.userId);
  const header = req.header('x-user-id');
  return header ? String(header) : undefined;
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(raw: any): string | null {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(raw))) return null;
  return String(raw);
}

export const budgetController = {
  /**
   * GET /api/v1/budget?month=YYYY-MM
   * Returns safe budget payload for UI bootstrap.
   */
  async getOverview(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let month = parseMonth(req.query.month);
      if (!month) month = getCurrentMonth();

      const [budgetData, categorySummary, monthlySummary] = await Promise.all([
        budgetService.getCurrent(userId, month),
        budgetService.getCategorySummary(userId, month),
        budgetService.getMonthlySummary(userId, month),
      ]);

      if (!budgetData) {
        return res.json({
          success: true,
          data: {
            hasBudget: false,
            month,
            totalBudget: 0,
            totalAllocated: 0,
            totalSpent: 0,
            remainingBudget: 0,
            categories: [],
            categorySummary: [],
            monthlySummary: {
              currentMonth: Number(monthlySummary?.currentMonth || 0),
              previousMonth: Number(monthlySummary?.previousMonth || 0),
            },
          },
        });
      }

      const totalAllocated = (budgetData.categories || []).reduce(
        (sum, c: any) => sum + Number(c?.limit || 0),
        0
      );

      return res.json({
        success: true,
        data: {
          hasBudget: true,
          ...budgetData,
          totalAllocated,
          remainingBudget: Number((budgetData as any).remaining || 0),
          categorySummary,
          monthlySummary,
        },
      });
    } catch (err: any) {
      console.error('[budgets:getOverview] error', err);
      return res.status(500).json({
        success: false,
        message: err?.message || 'Failed to fetch budget data',
      });
    }
  },

  /**
   * GET /api/v1/budgets/category-summary?month=YYYY-MM
   * Returns live expense totals grouped by category with budget limits.
   */
  async getCategorySummary(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let month = parseMonth(req.query.month);
      if (!month) month = getCurrentMonth();

      const data = await budgetService.getCategorySummary(userId, month);
      return res.json(data);
    } catch (err) {
      console.error('[budgets:getCategorySummary] error', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch category summary' });
    }
  },

  /**
   * GET /api/v1/budgets/monthly-summary?month=YYYY-MM
   * Returns expense totals for current and previous month.
   */
  async getMonthlySummary(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let month = parseMonth(req.query.month);
      if (!month) month = getCurrentMonth();

      const data = await budgetService.getMonthlySummary(userId, month);
      return res.json(data);
    } catch (err) {
      console.error('[budgets:getMonthlySummary] error', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch monthly summary' });
    }
  },

  /**
   * POST /api/v1/budgets  or  POST /api/v1/budgets/create
   * Upsert (create or update) a budget for a given month.
   */
  async createOrUpdate(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { month, totalBudget, categories } = req.body || {};

      if (!parseMonth(month)) {
        return res.status(400).json({ success: false, message: 'month must be in YYYY-MM format' });
      }
      if (typeof totalBudget !== 'number' || totalBudget < 0) {
        return res.status(400).json({ success: false, message: 'totalBudget must be a non-negative number' });
      }
      if (!Array.isArray(categories)) {
        return res.status(400).json({ success: false, message: 'categories must be an array' });
      }

      await budgetService.upsertBudget({
        userId,
        month: String(month),
        totalBudget,
        categories: categories.map((c: any) => ({
          name: String(c.name).trim(),
          limit: Number(c.limit) || 0
        }))
      });

      // Return the live-computed budget (with real spent values)
      const payload = await budgetService.getCurrent(userId, String(month));

      // Emit socket event for real-time sync
      io.emit('budgetUpdated', {
        userId,
        month: String(month),
        totalBudget: payload?.totalBudget ?? totalBudget,
        totalSpent: payload?.totalSpent ?? 0,
        categories: payload?.categories ?? [],
      });

      return res.status(200).json({
        success: true,
        data: payload,
        message: 'Budget saved successfully'
      });
    } catch (err: any) {
      console.error('[budgets:upsert] error', err);
      return res.status(500).json({ success: false, message: 'Failed to create or update budget' });
    }
  },

  /**
   * GET /api/v1/budgets/current?month=YYYY-MM
   * Returns the budget for the requested (or current) month with live
   * computed spent values from the Transaction collection.
   */
  async getCurrent(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let month = parseMonth(req.query.month);
      if (!month) month = getCurrentMonth();

      const budgetData = await budgetService.getCurrent(userId, month);

      if (!budgetData) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'No budget found for current month'
        });
      }

      return res.json({
        success: true,
        data: budgetData
      });
    } catch (err) {
      console.error('[budgets:getCurrent] error', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch current budget' });
    }
  },

  /**
   * GET /api/v1/budgets/summary?month=YYYY-MM
   * Returns enriched summary with comparison to previous month,
   * top category, and over-budget alerts.
   */
  async getSummary(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let month = parseMonth(req.query.month);
      if (!month) month = getCurrentMonth();

      const summary = await budgetService.getSummary(userId, month);

      return res.json({
        success: true,
        data: summary
      });
    } catch (err) {
      console.error('[budgets:getSummary] error', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch budget summary' });
    }
  },

  /**
   * PUT /api/v1/budgets/:id
   * Update an existing budget by its _id.
   */
  async update(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const budgetId = String(req.params.budgetId || req.params.id || '').trim();
      if (!budgetId) {
        return res.status(400).json({ success: false, message: 'Budget id is required.' });
      }

      const { totalBudget, month, year, categories } = req.body || {};
      const parsedTotalBudget = Number(totalBudget);
      if (!Number.isFinite(parsedTotalBudget) || parsedTotalBudget < 0) {
        return res.status(422).json({
          success: false,
          message: 'Total budget is required and must be valid.',
        });
      }
      if (!Array.isArray(categories)) {
        return res.status(422).json({
          success: false,
          message: 'Categories must be an array.',
        });
      }

      const normalizedCategories = categories.map((c: any) => ({
        name: String(c?.name || c?.category || '').trim(),
        limit: Number(c?.limit ?? c?.amount ?? 0),
      }));
      const hasInvalidCategory = normalizedCategories.some((c: any) => !c.name || !Number.isFinite(c.limit) || c.limit < 0);
      if (hasInvalidCategory) {
        return res.status(422).json({
          success: false,
          message: 'Each category must include a valid name and non-negative limit.',
        });
      }

      const totalAllocated = normalizedCategories.reduce((sum: number, c: any) => sum + Number(c.limit || 0), 0);
      if (totalAllocated > parsedTotalBudget) {
        return res.status(422).json({
          success: false,
          message: 'Allocated category limits cannot exceed total budget.',
        });
      }

      const normalizedMonth = parseMonth(month) || (year && month
        ? parseMonth(`${String(year)}-${String(month).padStart(2, '0')}`)
        : null);

      const updates: any = {
        totalBudget: parsedTotalBudget,
        categories: normalizedCategories,
      };
      if (normalizedMonth) updates.month = normalizedMonth;

      const doc = await budgetService.updateBudget(budgetId, userId, updates);
      if (!doc) {
        return res.status(404).json({
          success: false,
          message: 'Budget not found for this user.',
        });
      }

      // Return fresh computed data
      const payload = await budgetService.getCurrent(userId, doc.month);

      io.emit('budgetUpdated', {
        userId,
        month: doc.month,
        totalBudget: payload?.totalBudget ?? doc.totalBudget,
        totalSpent: payload?.totalSpent ?? 0,
        categories: payload?.categories ?? [],
      });

      return res.json({
        success: true,
        data: payload,
        message: 'Budget updated successfully.'
      });
    } catch (err) {
      console.error('[budgets:update] error', err);
      return res.status(500).json({ success: false, message: 'Failed to update budget' });
    }
  },

  /**
   * DELETE /api/v1/budgets/:id
   */
  async remove(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const budgetId = String(req.params.budgetId || req.params.id || '').trim();
      if (!budgetId) return res.status(400).json({ success: false, message: 'Budget id is required.' });

      const ok = await budgetService.deleteBudget(budgetId, userId);
      if (!ok) return res.status(404).json({ success: false, message: 'Budget not found' });

      io.emit('budgetUpdated', { userId, deleted: true });

      return res.json({ success: true, message: 'Budget deleted' });
    } catch (err) {
      console.error('[budgets:remove] error', err);
      return res.status(500).json({ success: false, message: 'Failed to delete budget' });
    }
  }
};
