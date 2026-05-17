import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaAnalyticsService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca';
  getAnalytics() { return this.http.get<any>(`${this.base}/analytics`); }
}
