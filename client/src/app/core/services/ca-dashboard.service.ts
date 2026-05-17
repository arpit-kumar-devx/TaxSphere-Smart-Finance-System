import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaDashboardService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca';
  getDashboard() { return this.http.get<any>(`${this.base}/dashboard`); }
}
