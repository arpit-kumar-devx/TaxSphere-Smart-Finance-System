import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin';

  getDashboard() {
    return this.http.get<any>(`${this.base}/dashboard`);
  }
}
