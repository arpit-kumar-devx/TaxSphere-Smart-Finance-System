import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ItrRecord } from './itr-api.service';
import { ItrStatus } from '../types/itr-status';

export interface CaAnalyticsOverview {
  assignedClients: number;
  assignedItrs: number;
  pendingReviews: number;
  approved: number;
  rejected: number;
  filed: number;
  commissionEarnings: number;
}

@Injectable({ providedIn: 'root' })
export class CaApiService {
  private readonly base = '/api/v1/ca';

  constructor(private http: HttpClient) {}

  getAssignedITRs(): Observable<{
    data: ItrRecord[];
    items?: ItrRecord[];
    commissionEarned?: number;
    paymentsCompleted?: number;
    summary?: {
      assignedCases?: number;
      pendingReview?: number;
      docsPending?: number;
      approved?: number;
      rejected?: number;
      filed?: number;
      commissionEarned?: number;
      paymentsCompleted?: number;
    };
  }> {
    return this.http.get<{
      data: ItrRecord[];
      items?: ItrRecord[];
      commissionEarned?: number;
      paymentsCompleted?: number;
      summary?: {
        assignedCases?: number;
        pendingReview?: number;
        docsPending?: number;
        approved?: number;
        rejected?: number;
        filed?: number;
        commissionEarned?: number;
        paymentsCompleted?: number;
      };
    }>(`${this.base}/assigned-itrs`);
  }

  getItr(id: string): Observable<ItrRecord> {
    return this.http.get<ItrRecord>(`${this.base}/itr/${id}`);
  }

  reviewDoc(
    itrId: string,
    docId: string,
    body: { status: 'verified' | 'rejected'; remarks?: string }
  ): Observable<ItrRecord> {
    return this.http.patch<ItrRecord>(`${this.base}/itr/${itrId}/document/${docId}/status`, body);
  }

  setStatus(
    itrId: string,
    body: { status: ItrStatus; caRemarks?: string }
  ): Observable<any> {
    return this.http.patch<any>(`${this.base}/itr/${itrId}/status`, body);
  }

  startReview(id: string): Observable<any> {
    return this.http.patch<any>(`${this.base}/itr/${id}/start-review`, {});
  }

  getProfile(): Observable<any> {
    return this.http.get<any>(`${this.base}/profile`);
  }

  updateProfile(data: any): Observable<any> {
    return this.http.put<any>(`${this.base}/profile`, data);
  }

  getAnalyticsOverview(): Observable<{ success: boolean; data: CaAnalyticsOverview }> {
    return this.http.get<{ success: boolean; data: CaAnalyticsOverview }>(`${this.base}/analytics`);
  }
}
