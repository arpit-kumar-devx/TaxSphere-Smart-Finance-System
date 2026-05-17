import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaActivityService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca/assigned-itrs';
  listRecentActivity() { return this.http.get<any>(this.base); }
}
