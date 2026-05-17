import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { DashboardResponse, IncomeVsExpensesResponse, TrendPeriod } from '../../features/dashboard/model/dashboard.models';

export interface DashboardSummaryData {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  estimatedTax: number;
  savingsRate: number;
  monthlyCashFlow: number;
  itrStatus: string;
  trend?: {
    incomePct: number;
    expensePct: number;
    savingsPct: number;
  };
}

export interface DashboardSummaryApiResponse {
  success: boolean;
  data: DashboardSummaryData;
}

export interface AnalyticsOverviewData {
  labels: string[];
  incomeSeries: number[];
  expenseSeries: number[];
  taxSeries: number[];
  topCategories: Array<{ category: string; amount: number }>;
}

export interface TaxSummaryData {
  estimatedTaxDue: number;
  regime: 'OLD' | 'NEW';
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = '/api/v1/dashboard';
  private analyticsBase = '/api/v1/analytics';
  private taxBase = '/api/v1/tax';
  private transactionsBase = '/api/v1/transactions';

  constructor(private http: HttpClient) {}

  /** Bust any local caches if you keep them elsewhere */
  invalidate() {
    // no-op for now; hook if you add caching
  }

  getDashboard(month?: number, year?: number, current: boolean = true): Observable<DashboardResponse> {
    let params = new HttpParams();
    if (!current) {
      if (month) params = params.set('month', String(month));
      if (year)  params = params.set('year', String(year));
    }
    return this.http.get<DashboardResponse>(`${this.base}`, { params });
  }

  /**
   * period: 'month' | 'quarter' | 'year'
   * If you pass custom month/year, they are used for month/quarter ranges.
   */
  getIncomeVsExpenses(period: TrendPeriod = 'month', current: boolean = true, month?: number, year?: number): Observable<IncomeVsExpensesResponse> {
    let params = new HttpParams().set('period', period);
    if (!current) {
      if (month) params = params.set('month', String(month));
      if (year)  params = params.set('year', String(year));
    }
    return this.http.get<IncomeVsExpensesResponse>(`${this.base}/income-vs-expenses`, { params });
  }

  /** NEW: Recent transactions */
  getRecentTransactions(limit: number = 8, startDate?: string, endDate?: string): Observable<{ transactions: any[] }> {
    let params = new HttpParams().set('limit', String(limit));
    if (startDate) params = params.set('startDate', startDate);
    if (endDate)   params = params.set('endDate', endDate);
    return this.http.get<{ transactions: any[] }>(`${this.transactionsBase}/recent`, { params }).pipe(
      catchError(() => this.http.get<{ transactions: any[] }>(`${this.base}/recent`, { params }))
    );
  }

  getDashboardSummary(startDate?: string, endDate?: string): Observable<DashboardSummaryData> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<DashboardSummaryApiResponse>(`${this.base}/summary`, { params }).pipe(
      map((res) => res.data),
      catchError(() =>
        this.http.get<DashboardResponse>(`${this.base}`, { params }).pipe(
          map((legacy) => {
            const totalIncome = Number(legacy?.income || 0);
            const totalExpenses = Number(legacy?.expense || 0);
            const netSavings = totalIncome - totalExpenses;
            const estimatedTax = Number(legacy?.tax || 0);
            const savingsRate = Number(legacy?.savingsRate || 0);
            return {
              totalIncome,
              totalExpenses,
              netSavings,
              estimatedTax,
              savingsRate,
              monthlyCashFlow: netSavings,
              itrStatus: legacy?.itrStatus || 'None',
              trend: {
                incomePct: 0,
                expensePct: 0,
                savingsPct: 0,
              },
            };
          })
        )
      )
    );
  }

  getTaxSummary(startDate?: string, endDate?: string): Observable<TaxSummaryData> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<{ success: boolean; data: TaxSummaryData }>(`${this.taxBase}/summary`, { params }).pipe(
      map((res) => res.data),
      catchError(() =>
        this.getDashboardSummary(startDate, endDate).pipe(
          map((summary) => ({
            estimatedTaxDue: summary.estimatedTax,
            regime: 'NEW' as const,
          }))
        )
      )
    );
  }

  getAnalyticsOverview(startDate?: string, endDate?: string): Observable<AnalyticsOverviewData> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http
      .get<{ success: boolean; data: AnalyticsOverviewData }>(`${this.analyticsBase}/overview`, { params })
      .pipe(
        map((res) => res.data),
        catchError(() =>
          this.http.get<any>(`${this.analyticsBase}/monthly`, { params }).pipe(
            map((monthly) => {
              const labels = Array.isArray(monthly?.labels) ? monthly.labels : [];
              const incomeSeries = Array.isArray(monthly?.incomeSeries) ? monthly.incomeSeries : [];
              const expenseSeries = Array.isArray(monthly?.expenseSeries) ? monthly.expenseSeries : [];
              const taxSeries = Array.isArray(monthly?.taxSeries) ? monthly.taxSeries : [];
              return {
                labels,
                incomeSeries,
                expenseSeries,
                taxSeries,
                topCategories: [],
              } as AnalyticsOverviewData;
            }),
            catchError(() =>
              of({
                labels: [],
                incomeSeries: [],
                expenseSeries: [],
                taxSeries: [],
                topCategories: [],
              })
            )
          )
        )
      );
  }
}
