import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CaAnalyticsService } from '../../../../core/services/ca-analytics.service';

@Component({
  selector: 'app-ca-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid" *ngIf="data as d">
      <article class="card"><h3>Total Assigned Cases</h3><strong>{{ d.assignedItrs || 0 }}</strong></article>
      <article class="card"><h3>Pending Reviews</h3><strong>{{ d.pendingReviews || 0 }}</strong></article>
      <article class="card"><h3>Approved / Rejected</h3><strong>{{ d.approved || 0 }} / {{ d.rejected || 0 }}</strong></article>
      <article class="card"><h3>Filed Count</h3><strong>{{ d.filed || 0 }}</strong></article>
      <article class="card"><h3>Commission Earned</h3><strong>₹{{ (d.commissionEarnings || 0) | number:'1.2-2' }}</strong></article>
      <article class="card"><h3>Review Pipeline</h3><p>{{ d.insights?.[0] || 'CA-specific pipeline analytics' }}</p></article>
    </div>
  `,
  styles: [`.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.card{background:#1e293b;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px}h3{margin:0 0 8px;font-size:13px;color:#93c5fd}strong{font-size:20px}p{margin:0;color:#cbd5e1}`],
})
export class CaAnalyticsComponent implements OnInit {
  data: any;
  constructor(private analytics: CaAnalyticsService) {}
  ngOnInit(): void {
    this.analytics.getAnalytics().subscribe((res) => this.data = res?.data || res);
  }
}
