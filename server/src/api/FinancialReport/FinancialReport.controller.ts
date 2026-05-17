import { Request, Response } from 'express';
import { createReport, listReports, getReport, deleteReport } from './FinancialReport.service';
import IncomeModel from '../income/Income.model';
import ExpenseModel from '../expense/Expense.model';
import Transaction from '../transaction/Transaction.model';

/* ─────────────────────────── LEGACY CRUD ─────────────────────────── */
export async function generate(req: Request, res: Response) {
  try {
    const { reportType, period, format } = req.body || {};
    if (!reportType || !period || !format)
      return res.status(400).json({ success: false, message: 'reportType, period, format are required' });
    const doc = await createReport(reportType, period, format, (req as any).user?._id);
    res.json({ success: true, data: doc });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function list(_req: Request, res: Response) {
  try {
    const items = await listReports();
    res.json({ success: true, data: items });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function byId(req: Request, res: Response) {
  try {
    const item = await getReport(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    await deleteReport(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

/* ─────────────────────── FINANCIAL DASHBOARD SUMMARY ─────────────────────── */
export async function dashboardSummary(req: Request, res: Response) {
  try {
    const userId = (req as any).user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    // Aggregate all transactions for this user
    const allTimeTotals = await Transaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);

    const totalIncome = Number(allTimeTotals.find(r => r._id === 'income')?.total || 0);
    const totalExpense = Number(allTimeTotals.find(r => r._id === 'expense')?.total || 0);
    const netProfit = totalIncome - totalExpense;


    // Estimate tax paid — real value would come from ITR data
    // Here we use a simplified 10% effective rate on income over $250k
    const taxPaid = totalIncome > 250_000 ? +(totalIncome * 0.1).toFixed(2) : 0;

    // Latest 20 transactions (from Transaction model) for table
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(20)
      .lean();

    const responseData = {
      totalIncome: +totalIncome.toFixed(2),
      totalExpense: +totalExpense.toFixed(2),
      netProfit: +netProfit.toFixed(2),
      taxPaid,
      transactions
    };
    
    console.log(`[Analytics API] User: ${userId}, Income: ${totalIncome}, Expense: ${totalExpense}`);

    return res.json(responseData);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

/* ─────────────────────── MONTHLY ANALYTICS BREAKDOWN ─────────────────────── */
export async function getMonthlyBreakdown(req: Request, res: Response) {
  try {
    const userId = (req as any).user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const monthsToFetch = 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 1, 1);

    // Aggregate monthly transactions (from the Transaction model)
    const monthlyAgg = await Transaction.aggregate([
      { 
        $match: { 
          userId, 
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type'
          },
          total: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Format for frontend labels (e.g., "Jan", "Feb")
    const labels: string[] = [];
    const incomeData: number[] = [];
    const expenseData: number[] = [];

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < monthsToFetch; i++) {
       const d = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 1 + i, 1);
       const y = d.getFullYear();
       const m = d.getMonth() + 1; // MongoDB months are 1-indexed

       labels.push(`${monthNames[d.getMonth()]} ${y}`);
       
       const incMatch = monthlyAgg.find(a => a._id.year === y && a._id.month === m && a._id.type === 'income');
       const expMatch = monthlyAgg.find(a => a._id.year === y && a._id.month === m && a._id.type === 'expense');

       incomeData.push(+(incMatch?.total ?? 0).toFixed(2));
       expenseData.push(+(expMatch?.total ?? 0).toFixed(2));
    }

    return res.json({
      labels,
      datasets: [
        { data: incomeData, label: 'Income', backgroundColor: 'rgba(52, 211, 153, 0.5)', borderColor: '#10b981', fill: true },
        { data: expenseData, label: 'Expenses', backgroundColor: 'rgba(239, 68, 68, 0.5)', borderColor: '#ef4444', fill: true }
      ]
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}

/* ─────────────────────── AI / RULE-BASED INSIGHTS ─────────────────────── */
export async function getAIInsights(req: Request, res: Response) {
  try {
    const { income = 0, expenses = 0, transactions = [], regime = 'NEW' } = req.body || {};

    const insights: string[] = [];
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const expenseRatio = income > 0 ? (expenses / income) * 100 : 0;

    // Rule 1 — savings rate
    if (savingsRate >= 30) {
      insights.push(`✅ Excellent! Your savings rate is ${savingsRate.toFixed(0)}%. You are building wealth efficiently.`);
    } else if (savingsRate >= 10) {
      insights.push(`💡 You are saving ${savingsRate.toFixed(0)}% of your income. Increasing this to 20% would significantly speed up your long-term goals.`);
    } else if (income > 0) {
      insights.push(`⚠️ Low savings alert: Only ${savingsRate.toFixed(0)}% of income is being saved. Consider a 50/30/20 budget rule.`);
    }

    // Rule 2 — expense ratio
    if (expenseRatio > 80) {
      insights.push(`🚨 High spending: Expenses are ${expenseRatio.toFixed(0)}% of income. Audit your "discretionary" categories to find leaks.`);
    }

    // Rule 3 — Regime specific tax saving (India-focused)
    if (regime === 'OLD') {
      if (income > 500000) {
        insights.push(`📋 [OLD REGIME] Maximize Section 80C (₹1.5L) and 80D (health insurance) to significantly lower your taxable income.`);
      }
      insights.push(`💼 [OLD REGIME] Consider NPS (Section 80CCD) for an additional ₹50,000 deduction benefit.`);
    } else {
      if (income > 750000) {
          insights.push(`💡 [NEW REGIME] Since your income exceeds ₹7.5L, standard deductions apply. Note that most exemptions like HRA aren't available here.`);
      }
      insights.push(`📋 [NEW REGIME] Focus on increasing your gross salary or business yield, as deduction-based tax saving is minimal in this regime.`);
    }

    // Rule 4 — transaction count
    if (transactions.length > 15) {
      insights.push(`📊 High transaction volume detected. Use auto-categorization to keep your reports clean.`);
    }

    // Rule 5 — net profit
    if (savings < 0) {
      insights.push(`🔴 Critical: You are operating at a deficit of $${Math.abs(savings).toFixed(2)} this period. Urgent budget review required.`);
    }

    // Default fallback if no rules triggered
    if (insights.length === 0) {
      insights.push('📌 Consistent tracking is the first step to wealth. Carry on recording your data for better future insights.');
    }

    return res.json({ insights });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
