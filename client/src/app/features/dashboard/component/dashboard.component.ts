import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, catchError, forkJoin, of, throwError } from 'rxjs';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexResponsive,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { io, Socket } from 'socket.io-client';

import { IncomeModalComponent } from '../../auth/components/income/income';
import { ExpenseModalComponent } from '../../auth/components/expense/expense';
import { AuthService, User } from '../../../core/services/auth.service';
import {
  AnalyticsOverviewData,
  DashboardService,
  DashboardSummaryData,
  TaxSummaryData,
} from '../../../core/services/dashboard.service';
import { ExpenseService } from '../../../core/services/expense.service';
import { IncomeService } from '../../../core/services/income.service';
import { ExpenseAnalyticsTransaction, TransactionService } from '../../../core/services/transaction.service';
import { LayoutService } from '../../../core/services/layout.service';

type RangeFilter = 'month' | 'quarter' | 'year';

type IncomePayloadFromModal = {
  description: string;
  amount: number | null;
  category: string;
  date: string;
  notes: string;
};

type ExpensePayloadFromModal = {
  description: string;
  amount: number | null;
  category: string;
  date: string;
  notes: string;
};

type RecentTx = {
  _id?: string;
  type: 'income' | 'expense';
  description: string;
  category: string;
  amount: number;
  date: string | Date;
};

type KpiTone = 'positive' | 'negative' | 'neutral';

type KpiCard = {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  trend: number;
  tone: KpiTone;
  icon: string;
};

type InsightCard = {
  title: string;
  message: string;
  tone: 'info' | 'warning' | 'success';
};

type RangeWindow = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
};

type AxisChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis?: ApexXAxis;
  yaxis?: ApexYAxis;
  stroke?: ApexStroke;
  fill?: ApexFill;
  dataLabels?: ApexDataLabels;
  grid?: ApexGrid;
  colors?: string[];
  tooltip?: ApexTooltip;
  plotOptions?: ApexPlotOptions;
  legend?: ApexLegend;
  responsive?: ApexResponsive[];
  labels?: string[];
};

type NonAxisChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels?: string[];
  dataLabels?: ApexDataLabels;
  legend?: ApexLegend;
  colors?: string[];
  stroke?: ApexStroke;
  fill?: ApexFill;
  tooltip?: ApexTooltip;
  responsive?: ApexResponsive[];
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    RouterModule,
    NgApexchartsModule,
    IncomeModalComponent,
    ExpenseModalComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  user: User | null = null;
  transactions: any[] = [];
  incomeData: any[] = [];
  expenseData: any[] = [];

  showIncome = false;
  showExpense = false;
  isDeletingAll = false;

  loading = true;
  refreshing = false;
  dashboardError: string | null = null;

  selectedRange: RangeFilter = 'month';
  recentSearch = '';

  incomes: any[] = [];
  expenses: ExpenseAnalyticsTransaction[] = [];
  filteredExpenses: ExpenseAnalyticsTransaction[] = [];

  expenseKpis = {
    total: 0,
    txCount: 0,
  };

  expenseDistributionHasData = false;
  expenseTrendHasData = false;
  expenseCategoryHasData = false;
  comparisonHasData = false;

  recent: RecentTx[] = [];
  kpiCards: KpiCard[] = [];
  insights: InsightCard[] = [];

  private summary: DashboardSummaryData = {
    totalIncome: 0,
    totalExpenses: 0,
    netSavings: 0,
    estimatedTax: 0,
    savingsRate: 0,
    monthlyCashFlow: 0,
    itrStatus: 'Draft',
    trend: {
      incomePct: 0,
      expensePct: 0,
      savingsPct: 0,
    },
  };

  private taxSummary: TaxSummaryData = {
    estimatedTaxDue: 0,
    regime: 'NEW',
  };

  private analyticsOverview: AnalyticsOverviewData = {
    labels: [],
    incomeSeries: [],
    expenseSeries: [],
    taxSeries: [],
    topCategories: [],
  };

  incomeExpenseHasData = false;
  cashFlowTrendHasData = false;

  incomeExpenseChartOptions: AxisChartOptions = this.createEmptyAxisChart('bar');
  cashFlowChartOptions: AxisChartOptions = this.createEmptyAxisChart('area');
  cashFlowTrendChartOptions: AxisChartOptions = this.createEmptyAxisChart('area');
  expenseDistributionChartOptions: NonAxisChartOptions = this.createEmptyDonutChart();
  expenseTrendChartOptions: AxisChartOptions = this.createEmptyAxisChart('line');
  expenseCategoryChartOptions: AxisChartOptions = this.createEmptyAxisChart('bar');

  private viewInitialized = false;
  private readonly sub = new Subscription();
  private readonly destroy$ = new Subject<void>();
  private socket?: Socket;
  private isDataFetchInProgress = false;
  private pendingRefresh = false;

  constructor(
    public auth: AuthService,
    public layout: LayoutService,
    private dash: DashboardService,
    private txApi: TransactionService,
    private expensesApi: ExpenseService,
    private incomesApi: IncomeService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.auth.currentUser$.subscribe((u) => {
      this.user = u;
    });

    if (isPlatformBrowser(this.platformId)) {
      this.user = this.auth.getCurrentUser();
    }
  }

  get filteredRecent(): RecentTx[] {
    const rows = [...this.recent].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const q = this.recentSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((tx) => {
      return (
        tx.category.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q)
      );
    });
  }

  trackByTx = (_: number, tx: RecentTx) => tx._id || tx.date;

  ngOnInit(): void {
    this.loadData(true);
    this.initRealtime();
    this.connectSocket();
  }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    this.viewInitialized = true;
    this.initCharts();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
    this.sub.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.socket?.disconnect();
  }

  onRangeChange(range: string): void {
    if (range !== 'month' && range !== 'quarter' && range !== 'year') return;
    this.selectedRange = range;
    this.loadExpenses(true);
  }

  retryLoad(): void {
    this.loadDashboardData(true);
  }

  openIncome(): void {
    this.showIncome = true;
    this.showExpense = false;
  }

  openExpense(): void {
    this.showExpense = true;
    this.showIncome = false;
  }

  closeIncome(): void {
    this.showIncome = false;
  }

  closeExpense(): void {
    this.showExpense = false;
  }

  onIncomeSave(evt: IncomePayloadFromModal): void {
    const amount = Number(evt?.amount ?? 0);
    if (!amount || amount <= 0 || !evt?.date) return;

    this.incomesApi
      .create({
        source: evt.description || 'Income',
        amount,
        category: evt.category || 'General',
        date: evt.date,
        notes: evt.notes,
      })
      .subscribe({
        next: () => {
          this.closeIncome();
          this.txApi.notifyTransactionUpdate();
        },
        error: (err) => {
          console.error('API ERROR (Income Save):', err);
        },
      });
  }

  onExpenseSave(evt: ExpensePayloadFromModal): void {
    const amount = Number(evt?.amount ?? 0);
    if (!amount || amount <= 0 || !evt?.date) return;

    this.expensesApi
      .addExpense({
        source: evt.description || 'Expense',
        description: evt.description || 'Expense',
        amount,
        category: evt.category || 'General',
        date: evt.date,
        notes: evt.notes,
      })
      .subscribe({
        next: () => {
          this.closeExpense();
          this.txApi.notifyTransactionUpdate();
        },
        error: (err) => {
          console.error('API ERROR (Expense Save):', err);
        },
      });
  }

  onDeleteRecent(tx: RecentTx): void {
    if (!tx._id) return;
    if (!confirm('Delete this transaction?')) return;
    console.log('Deleting ID:', tx._id);

    this.txApi.deleteTransaction(tx._id).subscribe({
      next: () => {
        this.txApi.notifyTransactionUpdate();
      },
      error: (err) => {
        console.error('Failed to delete transaction', err);
        alert(err?.error?.message || 'Failed to delete transaction. Please try again.');
      },
    });
  }

  onDeleteAllRecent(): void {
    if (!this.recent.length) return;
    if (!confirm('Delete all transactions? This cannot be undone.')) return;

    this.isDeletingAll = true;
    this.txApi.deleteAll().subscribe({
      next: () => {
        this.isDeletingAll = false;
        this.txApi.notifyTransactionUpdate();
      },
      error: (err) => {
        this.isDeletingAll = false;
        console.error('Failed to delete all transactions', err);
        alert(err?.error?.message || 'Failed to delete all transactions.');
      },
    });
  }

  onViewRecent(tx: RecentTx): void {
    const when = new Date(tx.date).toLocaleString();
    alert(
      `Transaction details\n\nType: ${tx.type}\nCategory: ${tx.category}\nAmount: ${this.formatCurrency(
        tx.amount
      )}\nDate: ${when}\nDescription: ${tx.description}`
    );
  }

  onEditRecent(tx: RecentTx): void {
    if (!tx._id) return;
    this.router.navigate(['/app/transactions'], {
      queryParams: { edit: tx._id },
    });
  }

  loadExpenses(showLoader: boolean = true): void {
    this.loadData(showLoader);
  }

  loadData(showLoader: boolean = true): void {
    this.loadDashboardData(showLoader);
  }

  private initRealtime(): void {
    this.sub.add(
      this.txApi.transactionUpdates$.subscribe(() => {
        if (!this.getAuthToken()) return;
        this.loadExpenses(false);
      })
    );
  }

  private connectSocket(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.socket?.connected) return;

    const socketUrl = 'http://localhost:5000';
    this.socket = io(socketUrl, { transports: ['websocket', 'polling'] });

    const refresh = () => {
      if (!this.getAuthToken()) return;
      this.loadExpenses(false);
    };

    this.socket.on('transaction_update', refresh);
    this.socket.on('transactionAdded', refresh);
    this.socket.on('transactionUpdated', refresh);
    this.socket.on('transactionDeleted', refresh);
  }

  private loadDashboardData(showLoader: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.isDataFetchInProgress) {
      this.pendingRefresh = true;
      return;
    }

    const token = this.getAuthToken();

    if (!token) {
      this.clearDashboardState();
      this.loading = false;
      this.refreshing = false;
      return;
    }

    if (showLoader) this.loading = true;
    if (!showLoader) this.refreshing = true;
    this.dashboardError = null;
    this.isDataFetchInProgress = true;

    const range = this.getRangeWindow();

    forkJoin({
      summary: this.dash
        .getDashboardSummary(range.startIso, range.endIso)
        .pipe(catchError((err) => this.fallbackOrThrow(err, this.summary))),
      tax: this.dash
        .getTaxSummary(range.startIso, range.endIso)
        .pipe(catchError((err) => this.fallbackOrThrow(err, this.taxSummary))),
      overview: this.dash
        .getAnalyticsOverview(range.startIso, range.endIso)
        .pipe(catchError((err) => this.fallbackOrThrow(err, this.analyticsOverview))),
      recent: this.dash
        .getRecentTransactions(10, range.startIso, range.endIso)
        .pipe(catchError((err) => this.fallbackOrThrow(err, { transactions: [] as any[] }))),
      expenses: this.txApi
        .getExpenses(2000)
        .pipe(catchError((err) => this.fallbackOrThrow(err, { data: [] as ExpenseAnalyticsTransaction[] }))),
      allTransactions: this.txApi
        .getTransactions({ page: 1, limit: 2000, sortBy: 'date', sortDir: 'desc' })
        .pipe(catchError((err) => this.fallbackOrThrow(err, { transactions: [] as any[] }))),
    }).subscribe({
      next: ({ summary, tax, overview, recent, expenses, allTransactions }) => {
        this.summary = summary;
        this.taxSummary = tax;
        this.analyticsOverview = overview;

        this.expenses = Array.isArray(expenses?.data) ? expenses.data : [];
        this.recent = this.normalizeRecentRows(recent?.transactions ?? []);
        this.transactions = Array.isArray(allTransactions?.transactions) ? allTransactions.transactions : [];
        this.incomeData = this.transactions.filter((t) => t?.type === 'income');
        this.expenseData = this.transactions.filter((t) => t?.type === 'expense');
        console.log('Transactions:', this.transactions);

        this.applyDateFilter(range.start, range.end);
        this.calculateKpis();
        this.refreshKpiCards();
        this.buildInsights();

        if (this.viewInitialized) {
          this.cdr.detectChanges();
          setTimeout(() => this.initCharts(), 0);
        }

        this.loading = false;
        this.refreshing = false;
        this.isDataFetchInProgress = false;
        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.loadDashboardData(false);
        }
      },
      error: (err) => {
        console.error('[Dashboard] load failed', err);
        this.dashboardError = 'Unable to load dashboard data right now.';
        this.loading = false;
        this.refreshing = false;
        this.isDataFetchInProgress = false;
        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.loadDashboardData(false);
        }
      },
    });
  }

  private fallbackOrThrow<T>(err: any, fallbackValue: T) {
    if (err?.status === 401) {
      return throwError(() => err);
    }
    console.error('[Dashboard] API fallback used', err);
    return of(fallbackValue);
  }

  private normalizeRecentRows(rows: any[]): RecentTx[] {
    return rows.map((tx: any) => ({
      _id: tx?._id,
      type: tx?.type === 'income' ? 'income' : 'expense',
      description: tx?.description || tx?.source || (tx?.type === 'income' ? 'Income' : 'Expense'),
      category: tx?.category || 'General',
      amount: Number(tx?.amount || 0),
      date: tx?.date || tx?.createdAt || new Date().toISOString(),
    }));
  }

  private getRangeWindow(): RangeWindow {
    const now = new Date();

    if (this.selectedRange === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start,
        end: now,
        startIso: start.toISOString(),
        endIso: now.toISOString(),
      };
    }

    if (this.selectedRange === 'quarter') {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStartMonth, 1);
      return {
        start,
        end: now,
        startIso: start.toISOString(),
        endIso: now.toISOString(),
      };
    }

    const start = new Date(now.getFullYear(), 0, 1);
    return {
      start,
      end: now,
      startIso: start.toISOString(),
      endIso: now.toISOString(),
    };
  }

  applyDateFilter(start?: Date, end?: Date): void {
    const now = new Date();
    const from = start ?? (
      this.selectedRange === 'year'
        ? new Date(now.getFullYear(), 0, 1)
        : this.selectedRange === 'quarter'
          ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
          : new Date(now.getFullYear(), now.getMonth(), 1)
    );
    const to = end ?? now;
    const startMs = from.getTime();
    const endMs = to.getTime();

    this.filteredExpenses = this.expenses.filter((e) => {
      const time = new Date(e.date).getTime();
      return Number.isFinite(time) && time >= startMs && time <= endMs;
    });

    this.setFlags();

    this.comparisonHasData =
      this.analyticsOverview.labels.length > 0 &&
      this.analyticsOverview.incomeSeries.length > 0 &&
      this.analyticsOverview.expenseSeries.length > 0;
  }

  private calculateKpis(): void {
    this.expenseKpis.total = this.expenses.reduce((sum, e) => sum + Number(e?.amount || 0), 0);
    this.expenseKpis.txCount = this.expenses.length;
  }

  private setFlags(): void {
    const hasData = this.filteredExpenses.length > 0;
    this.expenseDistributionHasData = hasData;
    this.expenseTrendHasData = hasData;
    this.expenseCategoryHasData = hasData;
  }

  private refreshKpiCards(): void {
    const totalIncome = Number(this.summary.totalIncome || 0);
    const totalExpenses = Number(this.summary.totalExpenses || 0);
    const netSavings = Number(this.summary.netSavings || totalIncome - totalExpenses);
    const estimatedTax = Number(this.taxSummary.estimatedTaxDue || this.summary.estimatedTax || 0);
    const savingsRate = Number(this.summary.savingsRate || (totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0));
    const monthlyCashFlow = Number(this.summary.monthlyCashFlow || this.getCurrentCashFlowFromOverview());

    const incomeTrend = Number(this.summary.trend?.incomePct ?? this.calculateTrend(this.analyticsOverview.incomeSeries));
    const expenseTrend = Number(this.summary.trend?.expensePct ?? this.calculateTrend(this.analyticsOverview.expenseSeries));
    const savingsTrend = Number(this.summary.trend?.savingsPct ?? this.calculateTrend([netSavings - monthlyCashFlow, netSavings]));

    this.kpiCards = [
      {
        id: 'income',
        title: 'Total Income',
        value: this.formatCurrency(totalIncome),
        subtitle: 'All credited income',
        trend: incomeTrend,
        tone: incomeTrend >= 0 ? 'positive' : 'negative',
        icon: 'IN',
      },
      {
        id: 'expense',
        title: 'Total Expenses',
        value: this.formatCurrency(totalExpenses),
        subtitle: 'All debited expenses',
        trend: expenseTrend,
        tone: expenseTrend <= 0 ? 'positive' : 'negative',
        icon: 'EX',
      },
      {
        id: 'savings',
        title: 'Net Savings',
        value: this.formatCurrency(netSavings),
        subtitle: netSavings >= 0 ? 'Positive balance' : 'Overspending alert',
        trend: savingsTrend,
        tone: netSavings >= 0 ? 'positive' : 'negative',
        icon: 'SV',
      },
      {
        id: 'tax',
        title: 'Estimated Tax Due',
        value: this.formatCurrency(estimatedTax),
        subtitle: `${this.taxSummary.regime} regime`,
        trend: 0,
        tone: 'neutral',
        icon: 'TX',
      },
      {
        id: 'rate',
        title: 'Savings Rate',
        value: `${Math.max(0, savingsRate).toFixed(1)}%`,
        subtitle: `${this.summary.itrStatus || 'Draft'} filing status`,
        trend: savingsTrend,
        tone: savingsRate >= 35 ? 'positive' : savingsRate >= 20 ? 'neutral' : 'negative',
        icon: 'RT',
      },
      {
        id: 'cashflow',
        title: 'Monthly Cash Flow',
        value: this.formatCurrency(monthlyCashFlow),
        subtitle: 'Income - Expense this month',
        trend: this.calculateTrend(this.analyticsOverview.incomeSeries.map((v, i) => v - (this.analyticsOverview.expenseSeries[i] || 0))),
        tone: monthlyCashFlow >= 0 ? 'positive' : 'negative',
        icon: 'CF',
      },
    ];
  }

  private buildInsights(): void {
    const totalIncome = Number(this.summary.totalIncome || 0);
    const totalExpenses = Number(this.summary.totalExpenses || 0);
    const savingsRate = Number(this.summary.savingsRate || 0);
    const taxDue = Number(this.taxSummary.estimatedTaxDue || 0);

    const categories = this.buildCategoryTotals(this.filteredExpenses);
    const highestCategory = categories.length ? categories[0] : null;
    const categoryShare =
      highestCategory && this.expenseKpis.total > 0
        ? (highestCategory.total / this.expenseKpis.total) * 100
        : 0;

    const insightCards: InsightCard[] = [];

    if (savingsRate < 20) {
      insightCards.push({
        title: 'Savings Warning',
        message: 'Your savings rate is below 20%. Reduce non-essential spending to improve long-term reserves.',
        tone: 'warning',
      });
    } else {
      insightCards.push({
        title: 'Savings Momentum',
        message: `Strong progress: your savings rate is ${savingsRate.toFixed(1)}% for the selected range.`,
        tone: 'success',
      });
    }

    if (categoryShare >= 40 && highestCategory) {
      insightCards.push({
        title: 'Expense Concentration',
        message: `${highestCategory.category} contributes ${categoryShare.toFixed(1)}% of your expenses. Setting a category cap can improve control.`,
        tone: 'warning',
      });
    }

    if (taxDue > 0) {
      insightCards.push({
        title: 'Tax Planning Tip',
        message: `Current estimated tax due is ${this.formatCurrency(taxDue)}. Keep this amount reserved to avoid last-minute pressure.`,
        tone: 'info',
      });
    }

    if (totalIncome > 0 && totalExpenses > totalIncome) {
      insightCards.push({
        title: 'Budget Optimization',
        message: 'Expenses are higher than income in this cycle. Prioritize fixed obligations and pause discretionary spends.',
        tone: 'warning',
      });
    } else {
      insightCards.push({
        title: 'Cash Flow Health',
        message: 'Income is covering expenses well. You can allocate surplus into emergency and tax reserve buckets.',
        tone: 'success',
      });
    }

    this.insights = insightCards.slice(0, 4);
  }

  private initCharts(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.viewInitialized) return;

    if (!this.filteredExpenses.length) {
      this.expenseDistributionHasData = false;
      this.expenseTrendHasData = false;
      this.expenseCategoryHasData = false;
      this.incomeExpenseHasData = false;
      this.cashFlowTrendHasData = false;
      this.comparisonHasData =
        this.analyticsOverview.labels.length > 0 &&
        this.analyticsOverview.incomeSeries.length > 0 &&
        this.analyticsOverview.expenseSeries.length > 0;
      return;
    }

    this.buildIncomeVsExpenseChart();
    this.buildCashFlowTrendChart();

    const categories = this.buildCategoryTotals(this.filteredExpenses);
    const categoryLabels = categories.map((item) => item.category);
    const categoryValues = categories.map((item) => Number(item.total.toFixed(2)));

    const monthlyTrend = this.buildMonthlyExpenseSeries(this.filteredExpenses);

    this.buildExpenseDistributionChart(categoryLabels, categoryValues);
    this.buildExpenseTrendChart(monthlyTrend.labels, monthlyTrend.values);
    this.buildExpenseCategoryChart(categoryLabels.slice(0, 7), categoryValues.slice(0, 7));
  }

  private buildIncomeVsExpenseChart(): void {
    const totalIncome = this.getTotalIncome();
    const totalExpenses = this.getTotalExpense();
    const net = this.getNet();
    this.incomeExpenseHasData = totalIncome > 0 || totalExpenses > 0 || net !== 0;
    if (!this.incomeExpenseHasData) return;

    this.incomeExpenseChartOptions = {
      series: [{ name: 'Amount', data: [totalIncome, totalExpenses, net] }],
      chart: { type: 'bar', height: 300, toolbar: { show: false }, animations: { enabled: true } },
      colors: ['#22c55e', '#ef4444', '#6366f1'],
      plotOptions: { bar: { borderRadius: 10, columnWidth: '40%' } },
      xaxis: { categories: ['Income', 'Expenses', 'Net'] },
      dataLabels: { enabled: false },
      yaxis: { labels: { formatter: (value) => this.formatCompact(Number(value || 0)) } },
      grid: { borderColor: '#e2e8f0' },
      tooltip: { y: { formatter: (value) => this.formatCurrency(Number(value || 0)) } },
    };
  }

  private buildCashFlowTrendChart(): void {
    const trend = this.buildMonthlyCashFlowSeries();
    this.cashFlowTrendHasData =
      trend.labels.length > 0 && trend.income.length > 0 && trend.expense.length > 0;
    if (!this.cashFlowTrendHasData) return;

    this.cashFlowChartOptions = {
      series: [
        { name: 'Income', data: trend.income },
        { name: 'Expense', data: trend.expense },
      ],
      chart: { type: 'area', height: 300, toolbar: { show: false }, animations: { enabled: true } },
      stroke: { curve: 'smooth', width: 3 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.04 } },
      colors: ['#22c55e', '#ef4444'],
      xaxis: { categories: trend.labels },
      yaxis: { labels: { formatter: (value) => this.formatCompact(Number(value || 0)) } },
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (value) => this.formatCurrency(Number(value || 0)) } },
      grid: { borderColor: '#e2e8f0' },
    };
    this.cashFlowTrendChartOptions = this.cashFlowChartOptions;
  }

  private buildExpenseDistributionChart(labels: string[], values: number[]): void {
    this.expenseDistributionChartOptions = {
      series: values,
      chart: { type: 'donut', height: 300, animations: { enabled: true } },
      labels,
      colors: ['#4f46e5', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'],
      dataLabels: { enabled: false },
      legend: { position: 'bottom' },
      stroke: { width: 0 },
      tooltip: { y: { formatter: (value) => this.formatCurrency(Number(value || 0)) } },
      responsive: [{ breakpoint: 900, options: { chart: { height: 260 } } }],
    };
  }

  private buildExpenseTrendChart(labels: string[], values: number[]): void {
    this.expenseTrendChartOptions = {
      series: [{ name: 'Expenses', data: values }],
      chart: { type: 'line', height: 300, toolbar: { show: false }, animations: { enabled: true } },
      xaxis: { categories: labels },
      yaxis: { labels: { formatter: (value) => this.formatCompact(Number(value || 0)) } },
      colors: ['#4f46e5'],
      stroke: { curve: 'smooth', width: 3 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.32, opacityTo: 0.04 } },
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (value) => this.formatCurrency(Number(value || 0)) } },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  private buildExpenseCategoryChart(labels: string[], values: number[]): void {
    this.expenseCategoryChartOptions = {
      series: [{ name: 'Spent', data: values }],
      chart: { type: 'bar', height: 300, toolbar: { show: false }, animations: { enabled: true } },
      plotOptions: { bar: { horizontal: true, borderRadius: 8, barHeight: '60%' } },
      xaxis: { categories: labels },
      yaxis: { labels: { show: true } },
      colors: ['#6366f1'],
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (value) => this.formatCurrency(Number(value || 0)) } },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  private buildCategoryTotals(rows: ExpenseAnalyticsTransaction[]): Array<{ category: string; total: number }> {
    const categoryMap = new Map<string, number>();
    for (const expense of rows) {
      const category = expense.category || 'Uncategorized';
      const amount = Math.max(0, Number(expense.amount || 0));
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    }

    return [...categoryMap.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  private buildMonthlyExpenseSeries(rows: ExpenseAnalyticsTransaction[]): { labels: string[]; values: number[] } {
    const range = this.getRangeWindow();
    const monthlyTotals = new Map<string, number>();

    for (const row of rows) {
      const dt = new Date(row.date);
      if (!Number.isFinite(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Number(row.amount || 0));
    }

    const labels: string[] = [];
    const values: number[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      labels.push(cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      values.push(Number((monthlyTotals.get(key) || 0).toFixed(2)));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { labels, values };
  }

  private calculateTrend(series: number[]): number {
    if (!series || series.length < 2) return 0;
    const current = Number(series[series.length - 1] || 0);
    const previous = Number(series[series.length - 2] || 0);
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private getCurrentCashFlowFromOverview(): number {
    if (!this.analyticsOverview.incomeSeries.length || !this.analyticsOverview.expenseSeries.length) return 0;
    const i = this.analyticsOverview.incomeSeries.length - 1;
    return Number(this.analyticsOverview.incomeSeries[i] || 0) - Number(this.analyticsOverview.expenseSeries[i] || 0);
  }

  private destroyCharts(): void {
    this.incomeExpenseChartOptions = this.createEmptyAxisChart('bar');
    this.cashFlowTrendChartOptions = this.createEmptyAxisChart('area');
    this.expenseDistributionChartOptions = this.createEmptyDonutChart();
    this.expenseTrendChartOptions = this.createEmptyAxisChart('line');
    this.expenseCategoryChartOptions = this.createEmptyAxisChart('bar');
  }

  private clearDashboardState(): void {
    this.expenses = [];
    this.filteredExpenses = [];
    this.recent = [];
    this.kpiCards = [];
    this.insights = [];
    this.expenseKpis.total = 0;
    this.expenseKpis.txCount = 0;
    this.expenseDistributionHasData = false;
    this.expenseTrendHasData = false;
    this.expenseCategoryHasData = false;
    this.incomeExpenseHasData = false;
    this.cashFlowTrendHasData = false;
    this.comparisonHasData = false;
    this.destroyCharts();
  }

  private getAuthToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return this.auth.getToken() ?? localStorage.getItem('token') ?? localStorage.getItem('access_token');
  }

  private getSocketUrl(): string {
    if (!isPlatformBrowser(this.platformId)) return 'http://localhost:5000';
    const host = window.location.hostname || 'localhost';
    return `http://${host}:5000`;
  }

  private createEmptyAxisChart(type: 'bar' | 'line' | 'area'): AxisChartOptions {
    return {
      series: [],
      chart: { type, height: 300, toolbar: { show: false } },
      dataLabels: { enabled: false },
      xaxis: { categories: [] },
    };
  }

  private createEmptyDonutChart(): NonAxisChartOptions {
    return {
      series: [],
      chart: { type: 'donut', height: 300 },
      labels: [],
      dataLabels: { enabled: false },
    };
  }

  getTotalIncome(): number {
    return this.incomeData.reduce((sum, t) => sum + Number(t?.amount || 0), 0);
  }

  getTotalExpense(): number {
    return this.expenseData.reduce((sum, t) => sum + Number(t?.amount || 0), 0);
  }

  getNet(): number {
    return this.getTotalIncome() - this.getTotalExpense();
  }

  private buildMonthlyCashFlowSeries(): { labels: string[]; income: number[]; expense: number[] } {
    const range = this.getRangeWindow();
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    for (const tx of this.transactions) {
      const dt = new Date(tx?.date);
      if (!Number.isFinite(dt.getTime())) continue;
      if (dt < range.start || dt > range.end) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const amount = Number(tx?.amount || 0);
      if (tx?.type === 'income') incomeMap.set(key, (incomeMap.get(key) || 0) + amount);
      if (tx?.type === 'expense') expenseMap.set(key, (expenseMap.get(key) || 0) + amount);
    }

    const labels: string[] = [];
    const income: number[] = [];
    const expense: number[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      labels.push(cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      income.push(Number((incomeMap.get(key) || 0).toFixed(2)));
      expense.push(Number((expenseMap.get(key) || 0).toFixed(2)));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { labels, income, expense };
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  formatCompact(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value || 0);
  }
}
