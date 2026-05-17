import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin/audit-logs';

  list() {
    return this.http.get<any>(this.base);
  }
}
