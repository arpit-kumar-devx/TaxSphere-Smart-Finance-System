import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PaymentApiService } from '../../../../core/services/payment-api.service';

@Component({
  selector: 'app-ca-placeholder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="card">
      <h2>{{ title }}</h2>
      <p>{{ text }}</p>
      <div *ngIf="isEarnings">
        <div class="totals">
          <span>Total Commission: ₹{{ (summary?.totals?.total || 0) | number:'1.2-2' }}</span>
          <span>This Month: ₹{{ (summary?.monthlyCommission || 0) | number:'1.2-2' }}</span>
          <span>Cases Paid: {{ summary?.casesPaid || 0 }}</span>
          <span>Pending Payout: ₹{{ (summary?.totals?.pendingPayout || 0) | number:'1.2-2' }}</span>
          <span>Paid Out: ₹{{ (summary?.totals?.paidOut || 0) | number:'1.2-2' }}</span>
        </div>
        <table *ngIf="summary?.items?.length">
          <thead><tr><th>ITR</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            <tr *ngFor="let it of summary.items">
              <td>{{ it.itrId }}</td>
              <td>₹{{ (it.commissionAmount || 0) | number:'1.2-2' }}</td>
              <td>{{ it.status }}</td>
              <td>{{ it.creditedAt | date:'short' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`.card{background:#1e293b;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px}h2{margin:0 0 8px}.totals{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:8px;text-align:left}`],
})
export class CaPlaceholderComponent {
  title = 'CA Module';
  text = 'This section is wired in CA-only layout and can be expanded with detailed workflows.';
  summary: any = null;
  isEarnings = false;
  constructor(private route: ActivatedRoute, private payments: PaymentApiService) {
    this.title = this.route.snapshot.data['title'] || this.title;
    this.text = this.route.snapshot.data['text'] || this.text;
    this.isEarnings = this.route.snapshot.routeConfig?.path === 'earnings';
    if (this.isEarnings) {
      this.payments.getCaCommissionSummary().subscribe((s) => (this.summary = s));
    }
  }
}
