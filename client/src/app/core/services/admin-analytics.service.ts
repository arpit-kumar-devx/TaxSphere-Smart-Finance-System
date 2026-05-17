import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin/analytics';

  getOverview() {
    return this.http.get<any>(`${this.base}/overview`);
  }
}
