import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaItrService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca';
  listAssigned() { return this.http.get<any>(`${this.base}/assigned-itrs`); }
  getItr(id: string) { return this.http.get<any>(`${this.base}/itr/${id}`); }
  updateStatus(id: string, status: string, caRemarks?: string) { return this.http.patch<any>(`${this.base}/itr/${id}/status`, { status, caRemarks }); }
  addRemarks(id: string, caRemarks: string) { return this.http.post<any>(`${this.base}/itr/${id}/remarks`, { status: 'under_review', caRemarks }); }
}
