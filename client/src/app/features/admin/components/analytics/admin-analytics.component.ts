import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminAnalyticsService } from '../../../../core/services/admin-analytics.service';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="grid" *ngIf="overview as o">
      <article class="card"><h3>User Growth Trend</h3><p>{{ o.data?.userGrowthTrend?.labels?.join(' / ') || '-' }}</p></article>
      <article class="card"><h3>Revenue Trend</h3><p>₹ {{ (o.data?.totalPaymentsCollected || 0) | number }}</p></article>
      <article class="card"><h3>ITR Filing Pipeline</h3><p>Pending {{ o.data?.pendingVerifications || 0 }} / Approved {{ o.data?.approvedFilings || 0 }}</p></article>
      <article class="card"><h3>Payment Breakdown</h3><p>{{ o.data?.paymentStatusSummary | json }}</p></article>
      <article class="card"><h3>CA Performance</h3><p>Total CAs: {{ o.data?.totalCAs || 0 }}</p></article>
      <article class="card"><h3>System Insights</h3><p *ngFor="let i of o.data?.insights">{{ i }}</p></article>
    </section>
  `,
  styles: [`
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 14px; }
    .card { background: #1e293b; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 16px; }
    h3 { margin: 0 0 8px; font-size: 14px; color: #a5b4fc; }
    p { margin: 0; color: #cbd5e1; font-size: 13px; }
  `],
})
export class AdminAnalyticsComponent implements OnInit {
  overview: any;
  constructor(private analytics: AdminAnalyticsService) {}
  ngOnInit(): void {
    this.analytics.getOverview().subscribe((res) => this.overview = res);
  }
}
