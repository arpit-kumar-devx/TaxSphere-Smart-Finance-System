import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, Location, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { Router, RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import {
  ReportService,
  FinancialReportData,
  InsightResponse
} from '../../../core/services/report.service';
import { AuthService, User } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { AnalyticsService, RoleAnalyticsOverview } from '../../../core/services/analytics.service';

import { ItrApiService } from '../../../core/services/itr-api.service';
import { SocketService } from '../../../core/services/socket.service';

@Component({
  selector: 'app-financial-reports',
  standalone: true,
  imports: [CommonModule, RouterModule, BaseChartDirective],
  templateUrl: './financialReport.html',
  styleUrls: ['./financialReport.css'],
})
export class FinancialReportsComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private location = inject(Location);
  private reportSvc = inject(ReportService);
  private analyticsSvc = inject(AnalyticsService);
  private itrSvc = inject(ItrApiService);
  public auth = inject(AuthService);
  public layout = inject(LayoutService);
  private platformId = inject(PLATFORM_ID);
  private socket = inject(SocketService);
  private sub = new Subscription();

  user: User | null = null;
  loading = true;
  errorMsg = '';
  
  data: FinancialReportData | null = null;
  insights: string[] = [];
  loadingInsights = false;
  latestRegime: string = 'NEW';
  activeRole: 'USER' | 'CA' | 'ADMIN' = 'USER';

  // Overview Chart configuration (Bar)
  public barChartLegend = true;
  public barChartData: ChartConfiguration<'bar'>['data'] = {
    labels: ['Total Income', 'Total Expense', 'Net Profit'],
    datasets: [
      { data: [0, 0, 0], label: 'Summary ($)', backgroundColor: ['#10b981', '#ef4444', '#6366f1'] }
    ]
  };
  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: {
      legend: { display: false }
    }
  };

  // Trend Chart configuration (Line/Area)
  public lineChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: []
  };
  public lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    },
    elements: {
      line: { tension: 0.4 }
    }
  };

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.user = this.auth.getCurrentUser();
    this.activeRole = (this.user?.role || 'USER') as 'USER' | 'CA' | 'ADMIN';
    this.fetchData();
    if (this.activeRole === 'USER') {
      this.fetchMonthlyBreakdown();
      this.detectRegime();
    }

    this.sub.add(this.socket.on('transactionAdded').subscribe(() => this.refreshAll()));
    this.sub.add(this.socket.on('transactionUpdated').subscribe(() => this.refreshAll()));
    this.sub.add(this.socket.on('transactionDeleted').subscribe(() => this.refreshAll()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  refreshAll() {
    this.fetchData();
    if (this.activeRole === 'USER') this.fetchMonthlyBreakdown();
  }

  detectRegime() {
    this.itrSvc.list().subscribe(res => {
      if (res && res.items && res.items.length > 0) {
        this.latestRegime = res.items[0].regime || 'NEW';
      }
    });
  }

  onClose() {
    if (isPlatformBrowser(this.platformId) && history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  fetchData() {
    this.loading = true;
    this.errorMsg = '';

    if (this.activeRole === 'ADMIN') {
      this.analyticsSvc.getAdminAnalytics().subscribe({
        next: (res) => {
          this.applyRoleAnalytics(res.data, 'Platform Analytics Overview');
          this.loading = false;
        },
        error: (e) => {
          this.errorMsg = e?.error?.message || 'Failed to load admin analytics';
          this.loading = false;
        }
      });
      return;
    }

    if (this.activeRole === 'CA') {
      this.analyticsSvc.getCaAnalytics().subscribe({
        next: (res) => {
          this.applyRoleAnalytics(res.data, 'CA Assigned Cases Analytics');
          this.loading = false;
        },
        error: (e) => {
          this.errorMsg = e?.error?.message || 'Failed to load CA analytics';
          this.loading = false;
        }
      });
      return;
    }

    this.reportSvc.getFinancialReport().subscribe({
      next: (res) => {
        this.data = res;
        this.updateCharts();
        this.fetchInsights();
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.error?.message || 'Failed to load report data';
        this.loading = false;
      }
    });
  }

  updateCharts() {
    if (this.data) {
      this.barChartData.datasets[0].data = [
        this.data.totalIncome,
        this.data.totalExpense,
        this.data.netProfit
      ];
      this.barChartData = { ...this.barChartData };
    }
  }

  fetchMonthlyBreakdown() {
    this.reportSvc.getMonthlyBreakdown().subscribe({
      next: (res) => {
        this.lineChartData = {
          labels: res.labels,
          datasets: res.datasets.map(ds => ({
             ...ds,
             pointBackgroundColor: ds.borderColor,
             pointBorderColor: '#fff',
             pointHoverBackgroundColor: '#fff',
             pointHoverBorderColor: ds.borderColor,
          })) as any
        };
      },
      error: (e) => console.error("Monthly breakdown error", e)
    });
  }

  fetchInsights() {
    if (this.activeRole !== 'USER') return;
    if (!this.data) return;
    this.loadingInsights = true;
    this.reportSvc.getAIInsights({
      income: this.data.totalIncome,
      expenses: this.data.totalExpense,
      transactions: this.data.transactions,
      regime: this.latestRegime
    }).subscribe({
      next: (res) => {
        this.insights = res.insights || [];
        this.loadingInsights = false;
      },
      error: (e) => {
        console.error("Insight fetching error", e);
        this.insights = ['Unable to generate insights at this moment.'];
        this.loadingInsights = false;
      }
    });
  }

  downloadPDF() {
    if (this.data) {
      this.reportSvc.downloadPDF(this.data, this.user?.name || 'User');
    }
  }

  exportExcel() {
    if (this.data) {
      this.reportSvc.exportExcel(this.data);
    }
  }

  private applyRoleAnalytics(payload: RoleAnalyticsOverview, fallbackInsight: string): void {
    this.data = {
      totalIncome: Number(payload.totalIncome || 0),
      totalExpense: Number(payload.totalExpense || 0),
      netProfit: Number(payload.netProfit || 0),
      taxPaid: Number(payload.taxPaid || 0),
      transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    };
    this.updateCharts();

    if (payload.monthlyBreakdown?.labels?.length) {
      this.lineChartData = {
        labels: payload.monthlyBreakdown.labels,
        datasets: payload.monthlyBreakdown.datasets.map((ds) => ({
          ...ds,
          pointBackgroundColor: ds.borderColor,
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: ds.borderColor,
        })) as any,
      };
    } else {
      this.lineChartData = { labels: [], datasets: [] };
    }

    this.insights = (payload.insights && payload.insights.length) ? payload.insights : [fallbackInsight];
  }
}
