import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ItrApiService, ItrRecord } from '../../../core/services/itr-api.service';
import { PaymentApiService } from '../../../core/services/payment-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

@Component({
  selector: 'app-itr-pay',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './itr-pay.component.html',
  styleUrls: ['./itr-pay.component.css'],
})
export class ItrPayComponent implements OnInit {
  itrId = '';
  itr: ItrRecord | null = null;
  err = '';
  busy = false;
  isTestMode = false;
  paymentStatus = '';
  filingStatus = '';
  amount = 0;
  breakdown: any = null;
  failureReason = '';
  user: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private itrApi: ItrApiService,
    private payApi: PaymentApiService,
    private toasts: ToastService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.itrId = this.route.snapshot.paramMap.get('id') || '';
    this.auth.currentUser$.subscribe((u) => (this.user = u));
    this.itrApi.get(this.itrId).subscribe({
      next: d => {
        this.itr = d;
        this.refreshPaymentState();
      },
      error: e => (this.err = e.error?.message || 'Not found'),
    });
  }

  private loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async pay(): Promise<void> {
    const ready = await this.loadRazorpayScript();
    if (!ready) {
      this.toasts.error('Unable to load payment gateway. Please check internet connection.');
      return;
    }
    this.payNow();
  }

  private getRazorpayContact(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) return digits;
    if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(-10);
    return '9999999999';
  }

  private payNow(): void {
    this.busy = true;
    this.err = '';
    this.payApi.createOrder(this.itrId).subscribe({
      next: res => {
        if (!environment.production) console.log('[payment] create order response:', res);
        const amountPaise = Number(res.amount || 0);
        const currency = String(res.currency || 'INR').toUpperCase();
        const keyId = String(res.keyId || '');
        const isValidKey = /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId);
        if (!Number.isFinite(amountPaise) || amountPaise <= 100) {
          this.busy = false;
          this.toasts.error('Invalid payment amount. Amount must be greater than 100 paise.');
          return;
        }
        if (currency !== 'INR') {
          this.busy = false;
          this.toasts.error('Invalid payment currency. Only INR is supported for UPI.');
          return;
        }
        if (!isValidKey) {
          this.busy = false;
          this.toasts.error('Invalid Razorpay key configuration.');
          return;
        }

        this.isTestMode = res.keyId.startsWith('rzp_test');
        this.amount = amountPaise;
        this.breakdown = (res as any).breakdown || this.breakdown;
        const prefillContact = this.getRazorpayContact(this.user?.phone || this.itr?.personalInfo?.mobile || '');
        const options: Record<string, unknown> = {
          key: keyId,
          amount: res.amount,
          currency,
          name: 'TaxSphere',
          description: 'ITR Filing & CA Review Fee',
          order_id: res.orderId,
          method: {
            upi: true,
            card: true,
            netbanking: true,
            wallet: true,
            paylater: true,
          },
          handler: (response: any) => {
            if (!environment.production) console.log('Razorpay success response:', response);
            this.verify(response);
          },
          modal: {
            ondismiss: () => {
              this.busy = false;
              this.toasts.info('Payment cancelled. You can retry.');
            }
          },
          prefill: {
            name: this.user?.name || 'TaxSphere User',
            email: this.user?.email || 'test@example.com',
            contact: prefillContact,
          },
          theme: { color: '#635bff' },
        };

        console.log('Razorpay checkout options:', options);
        console.log('Razorpay amount:', res.amount);
        console.log('Razorpay key:', res.keyId);
        console.log('Payment methods requested:', (options as any).method);

        const rzp = new window.Razorpay!(options);
        (rzp as any).on?.('payment.failed', () => {
          this.busy = false;
          this.toasts.error('Payment failed. Please try again.');
        });
        rzp.open();
        setTimeout(() => {
          console.warn('UPI is not visible because Razorpay account/payment method settings do not allow UPI in this mode.');
        }, 1200);
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Could not start payment. Please try again.';
        this.toasts.error(this.err);
      },
    });
  }

  private verify(response: any): void {
    this.payApi
      .verify({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        itrId: this.itrId,
      })
      .subscribe({
        next: (verifyRes) => {
          if (!environment.production) console.log('[payment] verify response:', verifyRes);
          this.busy = false;
          this.toasts.success('Payment completed successfully');
          this.refreshPaymentState();
          this.router.navigate(['/app/itr', this.itrId], { queryParams: { paid: 'true' } });
        },
        error: e => {
          this.busy = false;
          this.err = e.error?.message || 'Payment verification failed. Please contact support.';
          this.toasts.error(this.err);
        },
      });
  }

  private refreshPaymentState(): void {
    this.payApi.getStatus(this.itrId).subscribe({
      next: (s) => {
        this.paymentStatus = s.paymentStatus;
        this.filingStatus = s.filingStatus;
        this.amount = Number(s.amount || 0);
        this.breakdown = s.breakdown;
        this.failureReason = s.failureReason || '';
      },
    });
  }

  get canPay(): boolean {
    return this.filingStatus === 'payment_pending' && ['pending', 'created', 'failed'].includes(this.paymentStatus);
  }

  get payButtonText(): string {
    if (this.paymentStatus === 'created') return 'Continue';
    if (this.paymentStatus === 'failed') return 'Retry';
    return 'Pay';
  }

  downloadReceipt(): void {
    this.payApi.downloadReceipt(this.itrId).subscribe({
      next: (blob) => this.payApi.downloadBlob(blob, `TaxSphere_Receipt_${this.itrId}.pdf`),
      error: () => this.toasts.error('Failed to download receipt'),
    });
  }

  downloadInvoice(): void {
    this.payApi.downloadInvoice(this.itrId).subscribe({
      next: (blob) => this.payApi.downloadBlob(blob, `TaxSphere_Invoice_${this.itrId}.pdf`),
      error: () => this.toasts.error('Failed to download invoice'),
    });
  }
}
