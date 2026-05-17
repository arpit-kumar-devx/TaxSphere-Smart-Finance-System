import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaDocumentService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca';
  setDocumentStatus(itrId: string, docId: string, status: 'pending' | 'verified' | 'rejected', remarks?: string) {
    return this.http.patch<any>(`${this.base}/itr/${itrId}/document/${docId}/status`, { status, remarks });
  }
}
