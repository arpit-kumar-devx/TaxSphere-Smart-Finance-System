import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ItrStatus } from '../types/itr-status';
import { environment } from '../../../environments/environment';

export type ItrRegime = 'OLD' | 'NEW';

export interface ItrRecord {
  _id: string;
  userId: string;
  assignedCaId?: any; // Updated from string | null to any or User for flexibility
  assignedCa?: any;
  assessmentYear: string;
  financialYear: string;
  regime: ItrRegime;
  status: ItrStatus;
  filingStatus?: ItrStatus;
  paymentStatus?: 'not_required' | 'pending' | 'created' | 'paid' | 'failed' | 'refunded';
  taxPayable?: number;
  personalInfo: {
    firstName: string;
    lastName: string;
    pan: string;
    mobile: string;
    email: string;
  };
  income: {
    salary: number;
    business: number;
    capitalGains: number;
    otherIncome: number;
    totalIncome: number;
  };
  deductions: {
    c80C: number;
    c80D: number;
    c80E: number;
    c80G: number;
    nps: number;
    totalDeductions: number;
  };
  taxSummary: {
    taxableIncome: number;
    taxBeforeRebate: number;
    rebate87A: number;
    cess: number;
    finalTax: number;
  };
  payment?: {
    orderId?: string;
    paymentId?: string;
    amount?: number;
    paymentStatus?: 'not_required' | 'pending' | 'created' | 'paid' | 'failed' | 'refunded';
    paidAt?: string;
  };
  documents: Array<{
    _id: string;
    fileUrl: string;
    fileName?: string;
    type: string;
    status: 'pending' | 'verified' | 'rejected';
    remarks?: string;
    uploadedAt?: string;
  }>;
  caRemarks?: string;
  paymentId?: string;
  paymentAmount?: number;
  paidAt?: string;
  filedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ItrApiService {
  private readonly base = '/api/v1/itr';

  constructor(private http: HttpClient) {}

  list(): Observable<{ items: ItrRecord[] }> {
    return this.http.get<{ items: ItrRecord[] }>(this.base);
  }

  create(body: Partial<{ assessmentYear: string; financialYear: string; regime: ItrRegime }>): Observable<ItrRecord> {
    return this.http.post<ItrRecord>(this.base, body);
  }

  get(id: string): Observable<ItrRecord> {
    return this.http.get<ItrRecord>(`${this.base}/${id}`);
  }

  patch(id: string, body: Record<string, unknown>): Observable<ItrRecord> {
    return this.http.patch<ItrRecord>(`${this.base}/${id}`, body);
  }

  calculate(id: string): Observable<ItrRecord> {
    return this.http.post<ItrRecord>(`${this.base}/${id}/calculate`, {});
  }

  submitForPayment(id: string): Observable<ItrRecord> {
    return this.http.post<ItrRecord>(`${this.base}/${id}/submit-for-payment`, {});
  }

  submitFree(id: string): Observable<ItrRecord> {
    return this.http.post<ItrRecord>(`${this.base}/${id}/submit-free`, {});
  }

  uploadDocument(itrId: string, file: File, type: string): Observable<{ itr: ItrRecord }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    return this.http.post<{ itr: ItrRecord }>(`/api/v1/documents/itr/${itrId}`, fd);
  }

  downloadPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/pdf`, { responseType: 'blob' });
  }

  downloadItrPdf(itrId: string): Observable<Blob> {
    return this.http.get(`${environment.API_URL}/itr/${itrId}/download`, { responseType: 'blob' });
  }
}
