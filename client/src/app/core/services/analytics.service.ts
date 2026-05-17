import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type TaxRegime = 'OLD' | 'NEW';

export type AnalyticsSummaryResponse = {
  totalIncome: number;
  totalExpense: number;
  taxDue: number;
  savingsRatePct: number;
  expenseBreakdownByCategory: Array<{ category: string; amount: number }>;
};

export type AnalyticsMonthlyResponse = {
  labels: string[];
  incomeSeries: number[];
  expenseSeries: number[];
  taxSeries: number[];
};

export type AnalyticsCategoryResponse = {
  categories: string[];
  spentSeries: number[];
};

export type RoleAnalyticsOverview = {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  taxPaid: number;
  transactions: any[];
  insights?: string[];
  monthlyBreakdown?: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
    }>;
  };
  [key: string]: any;
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly base = '/api/v1/analytics';
  private readonly adminBase = '/api/v1/admin';
  private readonly caBase = '/api/v1/ca';

  constructor(private http: HttpClient) {}

  getSummary(year: number, month: number, regime: TaxRegime = 'NEW'): Observable<AnalyticsSummaryResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month))
      .set('regime', regime);
    return this.http.get<AnalyticsSummaryResponse>(`${this.base}/summary`, { params });
  }

  getMonthly(regime: TaxRegime = 'NEW'): Observable<AnalyticsMonthlyResponse> {
    const params = new HttpParams().set('regime', regime);
    return this.http.get<AnalyticsMonthlyResponse>(`${this.base}/monthly`, { params });
  }

  getCategory(year: number, month: number, top = 8): Observable<AnalyticsCategoryResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month))
      .set('top', String(top));
    return this.http.get<AnalyticsCategoryResponse>(`${this.base}/category`, { params });
  }

  getUserAnalytics(): Observable<{ success: boolean; data: RoleAnalyticsOverview }> {
    return this.http.get<{ success: boolean; data: RoleAnalyticsOverview }>(`${this.base}/user`);
  }

  getAdminAnalytics(): Observable<{ success: boolean; data: RoleAnalyticsOverview }> {
    return this.http.get<{ success: boolean; data: RoleAnalyticsOverview }>(`${this.adminBase}/analytics/overview`);
  }

  getCaAnalytics(): Observable<{ success: boolean; data: RoleAnalyticsOverview }> {
    return this.http.get<{ success: boolean; data: RoleAnalyticsOverview }>(`${this.caBase}/analytics/overview`);
  }
}

