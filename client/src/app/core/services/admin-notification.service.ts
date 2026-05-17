import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin/notifications';

  list() { return this.http.get<any>(this.base); }
  markRead(id: string) { return this.http.patch<any>(`${this.base}/${id}/read`, {}); }
  markAllRead() { return this.http.patch<any>(`${this.base}/read-all`, {}); }
}
