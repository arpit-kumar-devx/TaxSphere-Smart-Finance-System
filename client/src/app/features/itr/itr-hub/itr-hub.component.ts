import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ItrApiService, ItrRecord } from '../../../core/services/itr-api.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-itr-hub',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './itr-hub.component.html',
  styleUrls: ['./itr-hub.component.css'],
})
export class ItrHubComponent implements OnInit, OnDestroy {
  items: ItrRecord[] = [];
  loading = true;
  error = '';
  private subs = new Subscription();

  constructor(
    private itrApi: ItrApiService,
    private router: Router,
    private socket: SocketService,
    private toasts: ToastService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.itrApi.list().subscribe({
      next: r => {
        this.items = (r.items || []).map(this.normalizeItem);
        this.loading = false;
      },
      error: e => {
        console.error('[ItrHub] Error loading filings', e);
        this.error = e.error?.message || 'Failed to load filings';
        this.loading = false;
      },
    });

    this.bindRealtime();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  startNew(): void {
    this.itrApi.create({ assessmentYear: '2024-25', financialYear: '2023-24', regime: 'NEW' }).subscribe({
      next: itr => this.router.navigate(['/app/itr', itr._id]),
      error: e => (this.error = e.error?.message || 'Could not create ITR'),
    });
  }

  statusLabel(s: string): string {
    return s.replace(/_/g, ' ');
  }

  shouldShowPay(it: ItrRecord): boolean {
    const filingStatus = (it.filingStatus || it.status || '').toLowerCase();
    const paymentStatus = (it.paymentStatus || it.payment?.paymentStatus || 'not_required').toLowerCase();
    return filingStatus === 'payment_pending' && ['pending', 'created', 'failed'].includes(paymentStatus);
  }

  payButtonText(it: ItrRecord): string {
    const paymentStatus = (it.paymentStatus || it.payment?.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'created') return 'Continue';
    if (paymentStatus === 'failed') return 'Retry';
    return 'Pay';
  }

  downloadPdf(id: string): void {
    this.itrApi.downloadPdf(id).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ITR_Summary_${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
      error: e => {
        console.error('[ItrHub] Download PDF failed', e);
        this.error = 'PDF download failed';
      },
    });
  }

  private bindRealtime(): void {
    this.subs.add(
      this.socket.on('itrUpdated').subscribe((evt) => {
        if (!evt?.id) return;
        const idx = this.items.findIndex((i) => i._id === evt.id);
        if (idx >= 0) {
          const updated = this.normalizeItem({ ...this.items[idx], status: evt.status as any });
          const next = [...this.items];
          next[idx] = updated;
          this.items = next;
          this.toasts.info(`ITR ${evt.status.replace(/_/g, ' ')}`);
        }
      })
    );

    this.subs.add(
      this.socket.on('paymentUpdated').subscribe((evt) => {
        const idx = this.items.findIndex((i) => i._id === evt.itrId);
        if (idx >= 0) {
          const updated = this.normalizeItem({ ...this.items[idx], status: evt.status as any, payment: evt.payment as any });
          const next = [...this.items];
          next[idx] = updated;
          this.items = next;
          this.toasts.success('Payment updated');
        }
      })
    );
  }

  /** Ensures every item has safe defaults so the template never crashes */
  private normalizeItem = (it: ItrRecord): ItrRecord => ({
    ...it,
    filingStatus: (it.filingStatus || it.status) as any,
    paymentStatus: (it.paymentStatus || it.payment?.paymentStatus || 'not_required') as any,
    documents:    Array.isArray(it.documents)    ? it.documents    : [],
    personalInfo: it.personalInfo ?? { firstName: '', lastName: '', pan: '', mobile: '', email: '' },
    taxSummary:   it.taxSummary   ?? { taxableIncome: 0, taxBeforeRebate: 0, rebate87A: 0, cess: 0, finalTax: 0 },
    income:       it.income       ?? { salary: 0, business: 0, capitalGains: 0, otherIncome: 0, totalIncome: 0 },
    deductions:   it.deductions   ?? { c80C: 0, c80D: 0, c80E: 0, c80G: 0, nps: 0, totalDeductions: 0 },
  });
}
