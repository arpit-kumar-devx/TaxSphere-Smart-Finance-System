import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AdminSettingsService {
  private http = inject(HttpClient);
  private base = '/api/v1/admin/settings';

  get() { return this.http.get<any>(this.base); }
  update(payload: any) { return this.http.put<any>(this.base, payload); }
}
