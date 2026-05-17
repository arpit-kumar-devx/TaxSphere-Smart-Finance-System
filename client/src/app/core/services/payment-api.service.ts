import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateOrderResponse {
  success: boolean;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  itrId: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentApiService {
  private readonly base = `${environment.API_URL}/payment`;

  constructor(private http: HttpClient) {}

  getConfig(): Observable<{ success: boolean; keyId: string; currency: string }> {
    if (!environment.production) console.log('[payment] API base URL:', this.base);
    return this.http.get<{ success: boolean; keyId: string; currency: string }>(`${this.base}/config`);
  }

  createOrder(itrId: string): Observable<CreateOrderResponse> {
    if (!environment.production) console.log('[payment] create-order request for itr:', itrId);
    return this.http.post<CreateOrderResponse>(`${this.base}/itr/${itrId}/create-order`, {});
  }

  verify(payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    itrId: string;
  }): Observable<{ success: boolean; message?: string }> {
    if (!environment.production) console.log('[payment] verify request:', payload);
    return this.http.post<{ success: boolean; message?: string }>(`${this.base}/itr/${payload.itrId}/verify`, payload);
  }

  getStatus(itrId: string): Observable<{
    success: boolean;
    paymentStatus: string;
    filingStatus: string;
    amount: number;
    paidAt?: string | null;
    razorpayPaymentId?: string;
    failureReason?: string;
    breakdown?: {
      filingFee: number;
      caServiceFee: number;
      platformFee: number;
      subtotal: number;
      cgst: number;
      sgst: number;
      igst: number;
      totalGst: number;
    } | null;
  }> {
    return this.http.get<{
      success: boolean;
      paymentStatus: string;
      filingStatus: string;
      amount: number;
      paidAt?: string | null;
      razorpayPaymentId?: string;
      failureReason?: string;
      breakdown?: {
        filingFee: number;
        caServiceFee: number;
        platformFee: number;
        subtotal: number;
        cgst: number;
        sgst: number;
        igst: number;
        totalGst: number;
      } | null;
    }>(`${this.base}/itr/${itrId}/status`);
  }

  downloadReceipt(itrId: string): Observable<Blob> {
    return this.http.get(`${this.base}/itr/${itrId}/receipt`, { responseType: 'blob' });
  }

  downloadInvoice(itrId: string): Observable<Blob> {
    return this.http.get(`${this.base}/itr/${itrId}/invoice`, { responseType: 'blob' });
  }

  getCaCommissionSummary(): Observable<{
    success: boolean;
    totalCommission: number;
    monthlyCommission: number;
    casesPaid: number;
    totals: {
      total: number;
      pendingPayout: number;
      paidOut: number;
    };
    items: Array<{
      itrId: string;
      commissionAmount: number;
      status: string;
      creditedAt?: string;
      createdAt?: string;
    }>;
  }> {
    return this.http.get<{
      success: boolean;
      totalCommission: number;
      monthlyCommission: number;
      casesPaid: number;
      totals: {
        total: number;
        pendingPayout: number;
        paidOut: number;
      };
      items: Array<{
        itrId: string;
        commissionAmount: number;
        status: string;
        creditedAt?: string;
        createdAt?: string;
      }>;
    }>(`${this.base}/ca/commission-summary`);
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}
