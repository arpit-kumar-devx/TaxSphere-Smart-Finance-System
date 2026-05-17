import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ToastService } from './toast.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly base = `${environment.API_URL}/payment`;

  constructor(private http: HttpClient, private toasts: ToastService) {}

  createOrder(itrId: string): Observable<any> {
    return this.http.post(`${this.base}/itr/${itrId}/create-order`, {});
  }

  verifyPayment(itrId: string, payload: any): Observable<any> {
    return this.http.post(`${this.base}/itr/${itrId}/verify`, payload);
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

  private getRazorpayContact(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) return digits;
    if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(-10);
    return '9999999999';
  }

  openCheckout(orderData: any, onSuccess: (res: any) => void, onDismiss?: () => void): void {
    this.loadRazorpayScript().then((ready) => {
      if (!ready) {
        this.toasts.error('Unable to load payment gateway. Please try again.');
        return;
      }

      const amountPaise = Number(orderData.amount || 0);
      const currency = String(orderData.currency || 'INR').toUpperCase();
      const keyId = String(orderData.keyId || '');
      const isValidKey = /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId);
      if (!Number.isFinite(amountPaise) || amountPaise <= 100) {
        this.toasts.error('Invalid payment amount. Amount must be greater than 100 paise.');
        return;
      }
      if (currency !== 'INR') {
        this.toasts.error('Invalid payment currency. Only INR is supported for UPI.');
        return;
      }
      if (!isValidKey) {
        this.toasts.error('Invalid Razorpay key configuration.');
        return;
      }

      const prefillContact = this.getRazorpayContact(orderData?.prefill?.contact || '');
      const options = {
        key: keyId,
        amount: orderData.amount,
        currency,
        name: 'TaxSphere',
        description: 'ITR Filing & CA Review Fee',
        order_id: orderData.orderId,
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          paylater: true,
        },
        handler: (response: any) => {
          onSuccess(response);
        },
        modal: {
          ondismiss: () => {
            if (onDismiss) onDismiss();
          }
        },
        prefill: {
          name: orderData?.prefill?.name || 'TaxSphere User',
          email: orderData?.prefill?.email || 'test@example.com',
          contact: prefillContact
        },
        theme: {
          color: '#6366f1'
        }
      };

      console.log('Razorpay checkout options:', options);
      console.log('Razorpay amount:', orderData.amount);
      console.log('Razorpay key:', orderData.keyId);
      console.log('Payment methods requested:', (options as any).method);

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        this.toasts.error('Payment failed: ' + response.error.description);
        console.error('[Razorpay] Payment Failed', response.error);
      });
      rzp.open();
      setTimeout(() => {
        console.warn('UPI is not visible because Razorpay account/payment method settings do not allow UPI in this mode.');
      }, 1200);
    });
  }
}
