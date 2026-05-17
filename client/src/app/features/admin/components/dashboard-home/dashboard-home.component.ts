import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

@Component({
  selector: 'app-admin-dashboard-home',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="st-label">Total Users</div>
        <div class="st-val">{{ stats?.totalUsers || 0 }}</div>
        <div class="st-trend">Platform users</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Active Users</div>
        <div class="st-val">{{ stats?.activeUsers || 0 }}</div>
        <div class="st-trend up">Active this cycle</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Total CAs</div>
        <div class="st-val">{{ stats?.totalCAs || stats?.activeCAs || 0 }}</div>
        <div class="st-trend">Professional network</div>
      </div>
      <div class="stat-card">
        <div class="st-label">ITR Filings</div>
        <div class="st-val">{{ stats?.totalItrFilings || 0 }}</div>
        <div class="st-trend">All filings</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Pending Reviews</div>
        <div class="st-val">{{ stats?.pendingReviews || 0 }}</div>
        <div class="st-trend">Needs action</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Approved Filings</div>
        <div class="st-val">{{ stats?.approvedFilings || 0 }}</div>
        <div class="st-trend up">Processed successfully</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Failed Payments</div>
        <div class="st-val">{{ stats?.failedPayments || 0 }}</div>
        <div class="st-trend">Investigate failures</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Pending Payments</div>
        <div class="st-val">{{ stats?.pendingPayments || 0 }}</div>
        <div class="st-trend">Awaiting completion</div>
      </div>
      <div class="stat-card">
        <div class="st-label">Completed Payments</div>
        <div class="st-val">{{ stats?.completedPayments || 0 }}</div>
        <div class="st-trend up">Successfully paid</div>
      </div>
      <div class="stat-card">
        <div class="st-label">GST Collected</div>
        <div class="st-val">{{ (stats?.gstCollectedInr || 0) | currency:'INR' }}</div>
        <div class="st-trend">Tax collected from payments</div>
      </div>
      <div class="stat-card">
        <div class="st-label">CA Commission Credited</div>
        <div class="st-val">{{ (stats?.caCommissionCreditedInr || 0) | currency:'INR' }}</div>
        <div class="st-trend">Professional payouts</div>
      </div>
      <div class="stat-card highlight">
        <div class="st-label">Total Revenue</div>
        <div class="st-val">{{ (stats?.totalRevenueInr || 0) | currency:'INR' }}</div>
        <div class="st-trend">Platform-wide collections</div>
      </div>
      <div class="stat-card">
        <div class="st-label">System Health</div>
        <div class="st-val">{{ stats?.systemHealth || 'healthy' }}</div>
        <div class="st-trend" [class.up]="stats?.systemHealth === 'healthy'">Infrastructure status</div>
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-header">
        <h3>Revenue Trends</h3>
        <p>Income track across the current financial year</p>
      </div>
      <div class="main-chart">
        <canvas baseChart
          [data]="lineChartData"
          [options]="lineChartOptions"
          [type]="lineChartType">
        </canvas>
      </div>
    </div>
  `,
  styles: [`
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .stat-card { background: #1e293b; padding: 1.5rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); }
    .stat-card.highlight { background: linear-gradient(135deg, #4f46e5, #7c3aed); }
    .st-label { font-size: 0.8rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .highlight .st-label { color: rgba(255,255,255,0.7); }
    .st-val { font-size: 2rem; font-weight: 800; margin: 0.5rem 0; }
    .st-trend { font-size: 0.75rem; color: #64748b; font-weight: 500; }
    .st-trend.up { color: #10b981; }
    .highlight .st-trend { color: rgba(255,255,255,0.8); }

    .chart-container { background: #1e293b; border-radius: 24px; padding: 2rem; border: 1px solid rgba(255,255,255,0.05); }
    .chart-header h3 { margin: 0; font-size: 1.25rem; }
    .chart-header p { font-size: 0.85rem; color: #64748b; margin: 0.25rem 0 1.5rem 0; }
    .main-chart { height: 350px; position: relative; }
  `]
})
export class AdminDashboardHomeComponent implements OnInit {
  stats: any = null;
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [
      {
        data: [12000, 19000, 15000, 25000, 22000, 30000, 28000, 35000, 42000],
        label: 'Revenue (INR)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderColor: '#6366f1',
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#fff',
        fill: 'origin',
        tension: 0.4
      }
    ],
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };

  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { 
        backgroundColor: '#0f172a',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 13 }
      }
    },
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b' } },
      x: { grid: { display: false }, ticks: { color: '#64748b' } }
    }
  };

  public lineChartType: ChartType = 'line';

  constructor(private adminDashboard: AdminDashboardService) {}

  ngOnInit(): void {
    this.adminDashboard.getDashboard().subscribe(s => this.stats = s);
  }
}
