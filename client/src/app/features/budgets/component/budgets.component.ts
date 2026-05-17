import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef,
  ChangeDetectorRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BudgetService,
  Budget,
  BudgetCategorySummary,
  BudgetMonthlySummary,
} from '../../../core/services/budget.service';
import { BudgetFormComponent } from './budget-form.component';
import { SocketService } from '../../../core/services/socket.service';
import { catchError, forkJoin, of, Subscription, throwError } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import {
  Chart,
  PieController,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController
} from 'chart.js';

// Register Chart.js components
Chart.register(
  PieController, DoughnutController, ArcElement,
  BarController, BarElement,
  CategoryScale, LinearScale,
  Tooltip, Legend
);

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, BudgetFormComponent],
  templateUrl: './budgets.component.html',
  styleUrls: ['./budgets.component.css']
})
export class BudgetsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('pieCanvas') pieCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barCanvas') barCanvas!: ElementRef<HTMLCanvasElement>;

  budget: Budget | null = null;
  prevBudget: Budget | null = null;
  categorySummary: BudgetCategorySummary[] = [];
  monthlySummary: BudgetMonthlySummary = { currentMonth: 0, previousMonth: 0 };
  loading = true;
  error: string | null = null;
  editing = false;
  alerts: string[] = [];
  chartsReady = false;

  private pieChart?: Chart;
  private barChart?: Chart;
  private subs = new Subscription();
  private chartsInitialized = false;

  constructor(
    private budgetService: BudgetService,
    private socket: SocketService,
    private toasts: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadData();
    this.bindRealtime();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroyCharts();
  }

  ngAfterViewInit() {
    // Charts can only be initialized after data AND DOM are ready.
    // If data loaded before view init, render now.
    if (this.budget && !this.chartsInitialized) {
      setTimeout(() => this.renderCharts(), 50);
    }
  }

  private currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private mergeBudgetWithCategorySummary(budget: Budget, rows: BudgetCategorySummary[]): Budget {
    if (!rows.length) return budget;
    const categories = rows.map((row) => ({
      name: row.category,
      limit: Number(row.limit || 0),
      spent: Number(row.spent || 0),
    }));
    const totalSpent = categories.reduce((sum, c) => sum + Number(c.spent || 0), 0);
    const remaining = Math.max(0, Number(budget.totalBudget || 0) - totalSpent);
    const savingsRatio = Number(budget.totalBudget || 0) > 0
      ? Math.round(((Number(budget.totalBudget || 0) - totalSpent) / Number(budget.totalBudget || 0)) * 100)
      : (totalSpent > 0 ? 0 : 100);

    return {
      ...budget,
      categories,
      totalSpent,
      remaining,
      savingsRatio,
    };
  }

  loadData() {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    const month = this.currentMonthKey();

    forkJoin({
      current: this.budgetService.getCurrent(month).pipe(
        catchError((err) => throwError(() => err))
      ),
      categorySummary: this.budgetService.getCategorySummary(month).pipe(
        catchError((err) => {
          console.warn('[Budget] Category summary unavailable, using empty fallback.', err);
          return of([] as BudgetCategorySummary[]);
        })
      ),
      monthlySummary: this.budgetService.getMonthlySummary(month).pipe(
        catchError((err) => {
          console.warn('[Budget] Monthly summary unavailable, using zero fallback.', err);
          return of({ currentMonth: 0, previousMonth: 0 } as BudgetMonthlySummary);
        })
      ),
    }).subscribe({
      next: ({ current, categorySummary, monthlySummary }) => {
        this.categorySummary = categorySummary || [];
        this.monthlySummary = monthlySummary || { currentMonth: 0, previousMonth: 0 };
        this.budget = current ? this.mergeBudgetWithCategorySummary(current, this.categorySummary) : null;

        const prev$ = this.budget
          ? this.budgetService.getPreviousMonth(this.budget.month)
          : of(null);

        prev$.subscribe({
          next: (prev) => {
            this.prevBudget = prev;
            this.calculateInsights();
            this.loading = false;
            if (!this.budget) this.editing = false;
            this.cdr.detectChanges();
            setTimeout(() => this.renderCharts(), 100);
          },
          error: () => {
            this.prevBudget = null;
            this.calculateInsights();
            this.loading = false;
            this.cdr.detectChanges();
            setTimeout(() => this.renderCharts(), 100);
          },
        });
      },
      error: (e) => {
        console.error('Budget load failed:', e);
        this.loading = false;
        this.error = e?.error?.message || 'Failed to load budget data.';
        this.cdr.detectChanges();
      },
    });
  }

  onSaved() {
    this.editing = false;
    this.loadData();
  }

  retryLoad() {
    this.error = null;
    this.loadData();
  }

  // ─── Computed Properties ───────────────────────────────────────

  get currentMonthDisplay(): string {
    if (!this.budget) return 'Initial Setup';
    const [y, m] = this.budget.month.split('-');
    return new Date(+y, +m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  get remainingAmount(): number {
    if (!this.budget) return 0;
    return this.budget.remaining ?? Math.max(0, this.budget.totalBudget - (this.budget.totalSpent || 0));
  }

  get savingsRate(): number {
    if (!this.budget) return 100;
    if (this.budget.savingsRatio !== undefined) return this.budget.savingsRatio;
    if (this.budget.totalBudget <= 0) return 100;
    const spent = this.budget.totalSpent || 0;
    if (spent >= this.budget.totalBudget) return 0;
    return ((this.budget.totalBudget - spent) / this.budget.totalBudget) * 100;
  }

  get totalAllocated(): number {
    if (!this.budget?.categories?.length) return 0;
    return this.budget.categories.reduce((sum, c) => sum + Number(c.limit || 0), 0);
  }

  get unallocatedAmount(): number {
    if (!this.budget) return 0;
    return this.budget.totalBudget - this.totalAllocated;
  }

  get categoriesCount(): number {
    return this.budget?.categories?.length || 0;
  }

  get budgetInsight(): string {
    if (!this.budget) return 'Set your monthly spending plan to track category-wise allocations.';
    if (this.unallocatedAmount > 0) {
      return `You still have ₹${this.unallocatedAmount.toLocaleString('en-IN')} left to allocate.`;
    }
    if (this.unallocatedAmount < 0) {
      return `Your category allocation exceeds monthly budget by ₹${Math.abs(this.unallocatedAmount).toLocaleString('en-IN')}.`;
    }
    return 'Budget setup complete for this month.';
  }

  get hasCategories(): boolean {
    return !!this.budget?.categories?.length;
  }

  get totalCategorySpent(): number {
    if (!this.budget?.categories) return 0;
    return this.budget.categories.reduce((sum, c) => sum + (c.spent || 0), 0);
  }

  trackCategory(index: number, cat: any): string {
    return cat.name;
  }

  getPercent(spent: number, limit: number): number {
    if (limit === 0) return spent > 0 ? 100 : 0;
    return Math.min(100, (spent / limit) * 100);
  }

  getProgressColor(spent: number, limit: number): string {
    const p = this.getPercent(spent, limit);
    if (p < 70) return '#10b981';
    if (p <= 90) return '#f59e0b';
    return '#ef4444';
  }

  getStatusLabel(spent: number, limit: number): string {
    const p = this.getPercent(spent, limit);
    if (p >= 100) return 'Over Budget';
    if (p >= 80) return 'Warning';
    if (p >= 50) return 'On Track';
    return 'Healthy';
  }

  // ─── Insights ──────────────────────────────────────────────────

  private calculateInsights() {
    this.alerts = [];
    if (!this.budget) return;

    const rows = this.categorySummary.length
      ? this.categorySummary
      : this.budget.categories.map((c) => ({
          category: c.name,
          spent: Number(c.spent || 0),
          limit: Number(c.limit || 0),
          percentage: this.getPercent(Number(c.spent || 0), Number(c.limit || 0)),
        }));

    rows.forEach((row) => {
      const p = Number(row.percentage || 0);
      if (p >= 80 && Number(row.limit || 0) > 0) {
        this.alerts.push(`Warning: You are close to budget limit for "${row.category}" (${p.toFixed(0)}% used).`);
      }
    });

    if (this.monthlySummary.currentMonth > this.monthlySummary.previousMonth) {
      const diff = this.monthlySummary.currentMonth - this.monthlySummary.previousMonth;
      this.alerts.push(`Trend: Spending is up by ${diff.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} vs last month.`);
    } else if (this.monthlySummary.previousMonth > this.monthlySummary.currentMonth) {
      const diff = this.monthlySummary.previousMonth - this.monthlySummary.currentMonth;
      this.alerts.push(`Great: Spending is down by ${diff.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} vs last month.`);
    }

    if (this.savingsRate > 20) {
      this.alerts.push('Great job! Saving rate is healthy.');
    }
  }

  // ─── Charts ────────────────────────────────────────────────────

  private destroyCharts() {
    if (this.pieChart) { this.pieChart.destroy(); this.pieChart = undefined; }
    if (this.barChart) { this.barChart.destroy(); this.barChart = undefined; }
    this.chartsInitialized = false;
  }

  private renderCharts() {
    if (!this.budget) {
      console.log('[Budget] No budget data, skipping chart render.');
      return;
    }

    // Ensure canvases exist in the DOM
    if (!this.pieCanvas?.nativeElement || !this.barCanvas?.nativeElement) {
      setTimeout(() => this.renderCharts(), 200);
      return;
    }

    const ctxPie = this.pieCanvas.nativeElement.getContext('2d');
    const ctxBar = this.barCanvas.nativeElement.getContext('2d');
    if (!ctxPie || !ctxBar) {
      console.error('[Budget] Failed to get 2D context for chart canvases.');
      return;
    }

    // Destroy previous instances before re-creating
    this.destroyCharts();

    const categories = this.categorySummary.length
      ? this.categorySummary.map((c) => ({ name: c.category, spent: c.spent, limit: c.limit }))
      : (this.budget.categories || []).map((c) => ({ name: c.name, spent: c.spent || 0, limit: c.limit || 0 }));

    const catLabels = categories.map(c => c.name);
    const catSpent = categories.map(c => Number(c.spent || 0));

    // Check if all spent values are zero (show "no data" gracefully)
    const hasSpendingData = catSpent.some(v => v > 0);

    // ─── DOUGHNUT CHART: Spending Distribution ───
    const pieData = hasSpendingData ? catSpent : [1]; // Show placeholder if no data
    const pieLabels = hasSpendingData ? catLabels : ['No spending data'];
    const pieColors = hasSpendingData
      ? ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6', '#e11d48', '#84cc16']
      : ['#e2e8f0'];

    this.pieChart = new Chart(this.pieCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieData,
          backgroundColor: pieColors.slice(0, pieData.length),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#64748b',
              font: { size: 11, weight: 'bold' },
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 10
            }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed || 0;
                return ` ₹${val.toLocaleString('en-IN')}`;
              }
            }
          }
        }
      }
    });

    // ─── BAR CHART: Monthly Comparison ───
    const currentMonthSpent = Number(this.monthlySummary?.currentMonth || this.budget.totalSpent || 0);
    const previousMonthSpent = Number(this.monthlySummary?.previousMonth || this.prevBudget?.totalSpent || 0);

    this.barChart = new Chart(this.barCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Previous Month', 'Current Month'],
        datasets: [
          {
            label: 'Expenses',
            data: [previousMonthSpent, currentMonthSpent],
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10b981',
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              callback: (val) => `₹${Number(val).toLocaleString('en-IN')}`
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 12, weight: 'bold' } }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#64748b', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 10 }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}`
            }
          }
        }
      }
    });

    this.chartsInitialized = true;
    this.chartsReady = true;
    this.cdr.detectChanges();
  }

  // ─── PDF Export ──────────────────────────────────────────────

  async exportToPDF() {
    if (!this.budget) return;

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`Budget Report - ${this.currentMonthDisplay}`, 14, 22);

      doc.setFontSize(12);
      doc.text(`Total Budget: ₹${this.budget.totalBudget.toLocaleString('en-IN')}`, 14, 32);
      doc.text(`Total Spent: ₹${(this.budget.totalSpent || 0).toLocaleString('en-IN')}`, 14, 38);
      doc.text(`Remaining: ₹${this.remainingAmount.toLocaleString('en-IN')}`, 14, 44);
      doc.text(`Savings Ratio: ${this.savingsRate.toFixed(0)}%`, 14, 50);

      (autoTable as any)(doc, {
        startY: 60,
        head: [['Category', 'Limit (₹)', 'Spent (₹)', '% Used']],
        body: this.budget.categories.map(c => [
          c.name,
          c.limit.toLocaleString('en-IN'),
          (c.spent || 0).toLocaleString('en-IN'),
          `${this.getPercent(c.spent || 0, c.limit).toFixed(1)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241] }
      });

      doc.save(`Budget_Report_${this.budget.month}.pdf`);
      this.toasts.success('PDF exported successfully!');
    } catch (e) {
      console.error('[Budget] PDF export failed:', e);
      this.toasts.error('Failed to export PDF.');
    }
  }

  // ─── Real-Time Sync ────────────────────────────────────────────

  private bindRealtime() {
    // Direct budget update event
    this.subs.add(
      this.socket.on('budgetUpdated').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Real-time budgetUpdated event:', evt);
        this.loadData();
        this.toasts.success('Budget data refreshed');
      })
    );

    // Budget refresh triggered by transaction changes
    this.subs.add(
      this.socket.on('budgetRefresh').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Real-time budgetRefresh event:', evt);
        this.loadData();
      })
    );

    // Also refresh when individual transaction events fire
    this.subs.add(
      this.socket.on('transactionAdded').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Transaction added, refreshing budget data...');
        // Small delay to let the DB settle
        setTimeout(() => this.loadData(), 500);
      })
    );

    this.subs.add(
      this.socket.on('transactionUpdated').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Transaction updated, refreshing budget data...');
        setTimeout(() => this.loadData(), 500);
      })
    );

    this.subs.add(
      this.socket.on('transactionDeleted').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Transaction deleted, refreshing budget data...');
        setTimeout(() => this.loadData(), 500);
      })
    );

    this.subs.add(
      this.socket.on('paymentUpdated').subscribe((evt) => {
        if (!evt) return;
        console.log('[Budget] Payment updated, refreshing budget data...');
        setTimeout(() => this.loadData(), 500);
      })
    );
  }
}
