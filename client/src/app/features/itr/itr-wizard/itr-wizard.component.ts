import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { ItrApiService, ItrRecord } from '../../../core/services/itr-api.service';
import { PaymentService } from '../../../core/services/payment.service';
import { PaymentApiService } from '../../../core/services/payment-api.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-itr-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './itr-wizard.component.html',
  styleUrls: ['./itr-wizard.component.css'],
})
export class ItrWizardComponent implements OnInit {
  itrId = '';
  step = 0;
  itr: ItrRecord | null = null;
  busy = false;
  msg = '';
  err = '';
  uploadType = 'Form16';
  fileInput: File | null = null;
  liveCalcBusy = false;
  private liveCalcTimer: any = null;

  docTypes = ['Form16', 'BankStatement', 'PAN', 'Aadhaar', 'InvestmentProof', 'Other'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private itrApi: ItrApiService,
    private paymentService: PaymentService,
    private paymentApi: PaymentApiService,
    private socket: SocketService,
    private toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.itrId = this.route.snapshot.paramMap.get('id') || '';
    this.load();

    this.socket.on('itrUpdated').subscribe((evt) => {
      if (!this.itr || evt.id !== this.itrId) return;
      this.itr = this.normalizeItr({ ...(this.itr as any), status: evt.status as any, taxSummary: evt.taxSummary ?? this.itr.taxSummary });
      this.toasts.info(`ITR status: ${evt.status.replace(/_/g, ' ')}`);
    });

    this.socket.on('paymentUpdated').subscribe((evt) => {
      if (!this.itr || evt.itrId !== this.itrId) return;
      this.itr = this.normalizeItr({ ...(this.itr as any), status: evt.status as any, payment: evt.payment as any });
      this.toasts.success('Payment updated');
    });
  }

  /** Ensures nested objects exist for ngModel + PATCH body (JSON drops undefined). */
  private normalizeItr(d: ItrRecord): ItrRecord {
    return {
      ...d,
      filingStatus: (d.filingStatus || d.status) as any,
      paymentStatus: (d.paymentStatus || d.payment?.paymentStatus || 'not_required') as any,
      personalInfo: {
        firstName: d.personalInfo?.firstName ?? '',
        lastName: d.personalInfo?.lastName ?? '',
        pan: d.personalInfo?.pan ?? '',
        mobile: d.personalInfo?.mobile ?? '',
        email: d.personalInfo?.email ?? '',
      },
      income: {
        salary: d.income?.salary ?? 0,
        business: d.income?.business ?? 0,
        capitalGains: d.income?.capitalGains ?? 0,
        otherIncome: d.income?.otherIncome ?? 0,
        totalIncome: d.income?.totalIncome ?? 0,
      },
      deductions: {
        c80C: d.deductions?.c80C ?? 0,
        c80D: d.deductions?.c80D ?? 0,
        c80E: d.deductions?.c80E ?? 0,
        c80G: d.deductions?.c80G ?? 0,
        nps: d.deductions?.nps ?? 0,
        totalDeductions: d.deductions?.totalDeductions ?? 0,
      },
      taxSummary: {
        taxableIncome: d.taxSummary?.taxableIncome ?? 0,
        taxBeforeRebate: d.taxSummary?.taxBeforeRebate ?? 0,
        rebate87A: d.taxSummary?.rebate87A ?? 0,
        cess: d.taxSummary?.cess ?? 0,
        finalTax: d.taxSummary?.finalTax ?? 0,
      },
      documents: d.documents ?? [],
    };
  }

  load(): void {
    if (!this.itrId) return;
    this.itrApi.get(this.itrId).subscribe({
      next: d => {
        this.itr = this.normalizeItr(d);
        const filingStatus = (d.filingStatus || d.status || '').toLowerCase();
        if (['submitted', 'assigned', 'under_review', 'approved', 'payment_pending', 'payment_completed', 'filed', 'rejected'].includes(filingStatus)) {
          this.step = 5;
        }
      },
      error: e => (this.err = e.error?.message || 'Not found'),
    });
  }

  get editable(): boolean {
    return ['draft', 'payment_pending'].includes(this.currentFilingStatus);
  }

  get currentFilingStatus(): string {
    return String(this.itr?.filingStatus || this.itr?.status || '').toLowerCase();
  }

  get currentPaymentStatus(): string {
    return String(this.itr?.paymentStatus || this.itr?.payment?.paymentStatus || 'not_required').toLowerCase();
  }

  get canShowPayAction(): boolean {
    return this.currentFilingStatus === 'payment_pending' && ['pending', 'created', 'failed'].includes(this.currentPaymentStatus);
  }

  get payActionText(): string {
    if (this.currentPaymentStatus === 'created') return 'Continue';
    if (this.currentPaymentStatus === 'failed') return 'Retry';
    return 'Pay';
  }

  get isPaymentCompleted(): boolean {
    return this.currentPaymentStatus === 'paid' || ['payment_completed', 'filed'].includes(this.currentFilingStatus);
  }

  get filingStatusMessage(): string {
    if (this.currentFilingStatus === 'approved' && this.currentPaymentStatus === 'paid') {
      return 'Payment completed successfully. Your ITR PDF is available for download.';
    }
    switch (this.currentFilingStatus) {
      case 'draft':
        return 'Complete your ITR form to continue.';
      case 'submitted':
        return 'Your ITR has been submitted and is waiting for CA assignment.';
      case 'assigned':
        return 'Your ITR has been assigned to a CA for review.';
      case 'under_review':
        return 'Your CA is reviewing your documents.';
      case 'approved':
        return 'Your ITR has been approved. Please complete payment.';
      case 'payment_pending':
        return 'Your ITR has been approved by CA. Please complete payment to continue.';
      case 'payment_completed':
        return 'Payment completed successfully. Your filing is ready for final CA/Admin filing.';
      case 'filed':
        return 'Your ITR has been filed successfully.';
      case 'rejected':
        return 'Your ITR was rejected. Please check remarks and resubmit.';
      default:
        return 'Your filing status has been updated.';
    }
  }

  get statusMessageClass(): string {
    if (this.currentFilingStatus === 'approved' && this.currentPaymentStatus === 'paid') return 'hint success';
    return ['payment_completed', 'filed'].includes(this.currentFilingStatus) ? 'hint success' : 'hint';
  }

  private patchBody(): Record<string, unknown> | null {
    if (!this.itr) return null;
    return {
      regime: this.itr.regime,
      assessmentYear: this.itr.assessmentYear,
      financialYear: this.itr.financialYear,
      personalInfo: this.itr.personalInfo,
      income: this.itr.income,
      deductions: this.itr.deductions,
    };
  }

  savePartial(): void {
    if (!this.itr || !this.editable) return;
    const body = this.patchBody();
    if (!body) return;
    this.busy = true;
    this.err = '';
    this.itrApi.patch(this.itrId, body).subscribe({
      next: d => {
        this.itr = this.normalizeItr(d);
        this.busy = false;
        this.msg = 'Saved';
        setTimeout(() => (this.msg = ''), 2000);
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Save failed';
      },
    });
  }

  runCalculate(): void {
    if (!this.itr) return;
    this.busy = true;
    this.itrApi.calculate(this.itrId).subscribe({
      next: d => {
        this.itr = this.normalizeItr(d);
        this.busy = false;
        this.step = 3;
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Calculate failed';
      },
    });
  }

  /** Live tax calculation (debounced) for premium UX. */
  onInputChange(): void {
    if (!this.itr || !this.editable) return;
    if (this.liveCalcTimer) clearTimeout(this.liveCalcTimer);
    this.liveCalcBusy = true;

    this.liveCalcTimer = setTimeout(() => {
      // Save draft first (keeps server totals consistent), then calculate
      const body = this.patchBody();
      if (!body) { this.liveCalcBusy = false; return; }

      this.itrApi.patch(this.itrId, body).pipe(switchMap(() => this.itrApi.calculate(this.itrId))).subscribe({
        next: (d) => {
          this.itr = this.normalizeItr(d);
          this.liveCalcBusy = false;
        },
        error: () => {
          this.liveCalcBusy = false;
        }
      });
    }, 500);
  }

  onFileSelected(ev: Event): void {
    const t = ev.target as HTMLInputElement;
    const file = t.files?.[0] ?? null;
    
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        this.err = 'File size exceeds 5MB limit.';
        this.fileInput = null;
        t.value = '';
        return;
      }
      
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        this.err = 'Invalid file type. Only PDF, JPG, and PNG are allowed.';
        this.fileInput = null;
        t.value = '';
        return;
      }
      
      this.err = '';
      this.fileInput = file;
    } else {
      this.fileInput = null;
    }
  }

  uploadDoc(): void {
    if (!this.fileInput || !this.itr) return;
    this.busy = true;
    this.itrApi.uploadDocument(this.itrId, this.fileInput, this.uploadType).subscribe({
      next: r => {
        this.itr = this.normalizeItr(r.itr);
        this.fileInput = null;
        this.busy = false;
        this.msg = 'Document uploaded';
        setTimeout(() => (this.msg = ''), 2500);
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Upload failed';
      },
    });
  }

  get hasRequiredDocs(): boolean {
    if (!this.itr) return false;
    const types = this.itr.documents.map(d => d.type);
    return types.includes('PAN') && types.includes('Aadhaar') && types.includes('Form16');
  }

  submitForPayment(): void {
    if (!this.itr || !this.editable) return;
    
    // CHECK: Zero Tax UX
    if (this.itr.taxSummary.finalTax <= 0) {
      if (confirm('No payment required because your final tax is ₹0. Submit now?')) {
        this.busy = true;
        this.itrApi.submitFree(this.itrId).subscribe({
          next: (res) => {
            this.busy = false;
            this.itr = this.normalizeItr(res);
            this.toasts.success('ITR submitted successfully without payment.');
            this.step = 5; 
          },
          error: (e) => {
            this.busy = false;
            this.err = e.error?.message || 'Free submission failed';
            this.toasts.error(this.err);
          }
        });
      }
      return;
    }

    // CHECK: Required Documents (PAN, Aadhaar, Form16)
    if (!this.hasRequiredDocs) {
      this.err = 'Required documents (PAN, Aadhaar, Form 16) are missing. Please upload them to proceed.';
      this.toasts.error('Documentation Incomplete');
      return;
    }

    const body = this.patchBody();
    if (!body) return;

    this.busy = true;
    this.err = '';
    
    // 1. Save latest draft
    this.itrApi.patch(this.itrId, body).pipe(
      // 2. Mark as payment pending on server
      switchMap(() => this.itrApi.submitForPayment(this.itrId)),
      // 3. Create Razorpay order
      switchMap(() => this.paymentService.createOrder(this.itrId))
    ).subscribe({
      next: (orderData) => {
        this.busy = false;
        // 4. Open Razorpay Checkout
        this.paymentService.openCheckout(
          orderData,
          (paymentRes) => this.verifyPayment(paymentRes),
          () => { this.toasts.info('Payment cancelled'); }
        );
      },
      error: (e) => {
        this.busy = false;
        this.err = e.error?.message || 'Submission failed';
        this.toasts.error(this.err);
      }
    });
  }

  private verifyPayment(res: any): void {
    this.busy = true;
    const payload = {
      razorpay_order_id: res.razorpay_order_id,
      razorpay_payment_id: res.razorpay_payment_id,
      razorpay_signature: res.razorpay_signature,
      itrId: this.itrId
    };

    this.paymentService.verifyPayment(this.itrId, payload).subscribe({
      next: () => {
        this.busy = false;
        this.itrApi.get(this.itrId).subscribe((itr) => (this.itr = this.normalizeItr(itr)));
        this.toasts.success('Payment verified! ITR submitted.');
        this.step = 5;
      },
      error: (e) => {
        this.busy = false;
        this.err = e.error?.message || 'Payment verification failed';
        this.toasts.error(this.err);
      }
    });
  }

  statusLabel(s: string): string {
    return s ? s.replace(/_/g, ' ') : '';
  }

  next(): void {
    if (this.step < 4) this.step++;
    if (this.step === 1 || this.step === 2) this.savePartial();
  }

  prev(): void {
    if (this.step > 0) this.step--;
  }

  goPay(): void {
    this.router.navigate(['/payment', this.itrId]);
  }

  downloadReceipt(): void {
    if (!this.isPaymentCompleted) return;
    this.paymentApi.downloadReceipt(this.itrId).subscribe({
      next: (blob) => this.paymentApi.downloadBlob(blob, `TaxSphere_Receipt_${this.itrId}.pdf`),
      error: () => this.toasts.error('Failed to download receipt'),
    });
  }

  downloadInvoice(): void {
    if (!this.isPaymentCompleted) return;
    this.paymentApi.downloadInvoice(this.itrId).subscribe({
      next: (blob) => this.paymentApi.downloadBlob(blob, `TaxSphere_Invoice_${this.itrId}.pdf`),
      error: () => this.toasts.error('Failed to download invoice'),
    });
  }

  downloadItrPdf(): void {
    if (!this.itrId) return;
    if (!this.isPaymentCompleted) {
      this.toasts.info('ITR PDF is available only after payment completion.');
      return;
    }
    this.itrApi.downloadItrPdf(this.itrId).subscribe({
      next: (blob) => this.downloadBlob(blob, `TaxSphere_ITR_${this.itrId}.pdf`),
      error: async (err) => {
        console.error('ITR PDF download failed:', err);
        this.err = await this.extractErrorMessage(err, 'Unable to download ITR PDF. Please try again.');
        this.toasts.error(this.err);
      },
    });
  }

  private async extractErrorMessage(err: any, fallback: string): Promise<string> {
    try {
      if (err?.error instanceof Blob) {
        const text = await err.error.text();
        if (!text) return fallback;
        try {
          const parsed = JSON.parse(text);
          return parsed?.message || fallback;
        } catch {
          return text || fallback;
        }
      }
      return err?.error?.message || err?.message || fallback;
    } catch {
      return fallback;
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
