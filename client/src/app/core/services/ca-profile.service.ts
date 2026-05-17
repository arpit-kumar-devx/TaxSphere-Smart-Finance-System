import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CaProfileService {
  private http = inject(HttpClient);
  private base = '/api/v1/ca/profile';
  getProfile() { return this.http.get<any>(this.base); }
  updateProfile(payload: any) { return this.http.put<any>(this.base, payload); }
}
