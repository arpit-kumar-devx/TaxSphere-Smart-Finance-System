import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin/users';

  list() { return this.http.get<any>(this.base); }
  updateRole(id: string, role: string) { return this.http.patch<any>(`${this.base}/${id}/role`, { role }); }
  updateStatus(id: string, status: string) { return this.http.patch<any>(`${this.base}/${id}/status`, { status }); }
}
