import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ItrRecord } from './itr-api.service';
import { ItrStatus } from '../types/itr-status';

export interface AdminStats {
  totalUsers: number;
  totalItrFilings: number;
  pendingVerifications: number;
  activeCAs: number;
  totalRevenuePaise: number;
  totalRevenueInr: number;
}

export interface AdminAnalyticsOverview {
  totalUsers: number;
  totalAdmins: number;
  totalCAs: number;
  totalItrFilings: number;
  pendingVerifications: number;
  approvedFilings: number;
  rejectedFilings: number;
  totalPaymentsCollected: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  paymentStatusSummary: Record<string, number>;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'CA' | 'ADMIN';
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface AuditLogRow {
  _id: string;
  adminId: { id: string; name: string; email: string };
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface SystemSettings {
  appName: string;
  logoUrl: string;
  maintenanceMode: boolean;
  notificationEnabled: boolean;
  paymentMode: 'test' | 'live';
  taxYear: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly base = '/api/v1/admin';

  constructor(private http: HttpClient) {}

  stats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.base}/stats`);
  }

  analyticsOverview(): Observable<{ success: boolean; data: AdminAnalyticsOverview }> {
    return this.http.get<{ success: boolean; data: AdminAnalyticsOverview }>(`${this.base}/analytics/overview`);
  }

  // Users
  users(): Observable<{ items: AdminUserRow[] }> {
    return this.http.get<{ items: AdminUserRow[] }>(`${this.base}/users`);
  }

  setUserRole(userId: string, role: string): Observable<AdminUserRow> {
    return this.http.patch<AdminUserRow>(`${this.base}/users/${userId}/role`, { role });
  }

  setUserStatus(userId: string, status: string): Observable<any> {
    return this.http.patch<any>(`${this.base}/users/${userId}/status`, { status });
  }

  // ITRs
  itrs(): Observable<{ items: ItrRecord[] }> {
    return this.http.get<{ items: ItrRecord[] }>(`${this.base}/itr`);
  }

  updateItrStatus(id: string, status: ItrStatus, remarks?: string): Observable<ItrRecord> {
    return this.http.patch<ItrRecord>(`${this.base}/itr/${id}/status`, { status, remarks });
  }

  assignCa(itrId: string, caId: string): Observable<ItrRecord> {
    return this.http.patch<ItrRecord>(`${this.base}/itr/${itrId}/assign-ca`, { caId });
  }

  // Audit
  auditLogs(): Observable<{ items: AuditLogRow[] }> {
    return this.http.get<{ items: AuditLogRow[] }>(`${this.base}/audit-logs`);
  }

  // Settings
  getSettings(): Observable<SystemSettings> {
    return this.http.get<SystemSettings>(`${this.base}/settings`);
  }

  updateSettings(settings: Partial<SystemSettings>): Observable<SystemSettings> {
    return this.http.put<SystemSettings>(`${this.base}/settings`, settings);
  }

  // Helpers
  searchCas(): Observable<{ items: Array<{ id: string; name: string; email: string }> }> {
    return this.http.get<{ items: Array<{ id: string; name: string; email: string }> }>(`${this.base}/cas`);
  }
}
