import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminItrService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin';

  list() { return this.http.get<any>(`${this.base}/itrs`); }
  updateStatus(id: string, status: string, remarks?: string) {
    return this.http.patch<any>(`${this.base}/itrs/${id}/status`, { status, remarks });
  }
  assignCa(id: string, caUserId: string) {
    return this.http.patch<any>(`${this.base}/itrs/${id}/assign-ca`, { caUserId });
  }
  listCas() { return this.http.get<any>(`${this.base}/cas`); }
}
