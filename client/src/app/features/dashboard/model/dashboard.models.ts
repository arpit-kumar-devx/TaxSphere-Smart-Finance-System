// Pie breakdown entries
export interface BreakdownEntry {
  category: string;
  amount: number;
}

// Recent transaction item
export type TxType = 'income' | 'expense';
export interface TransactionView {
  _id: string;
  userId?: string;
  user_id?: string; // API uses user_id in /dashboard/recent mapping
  type: TxType;
  amount: number;
  category: string;
  description?: string;
  date: string | Date;     // server returns Date-like, client may convert
  createdAt?: string;
  updatedAt?: string;
}

// Current /api/v1/dashboard response (matches server/src/api/dashboard/dashboardController.ts)
export interface DashboardResponse {
  income: number;
  expense: number;
  tax: number;
  savingsRate: number;
  itrStatus: string;
  breakdown: { byCategory: BreakdownEntry[] };
  recentTransactions: TransactionView[];
  chartData?: { income: number; expense: number };
}

// /api/v1/dashboard/income-vs-expenses response
export type TrendPeriod = 'month' | 'quarter' | 'year';
export interface Series {
  label: string;           // 'Income' | 'Expenses'
  data: number[];
}
export interface IncomeVsExpensesResponse {
  labels: string[];        // e.g. ['2025-07','2025-08',...]
  series: Series[];        // two datasets
  period: TrendPeriod;
}

