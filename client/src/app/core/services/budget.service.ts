import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

// ---------- Types ----------

export interface BudgetCategory {
  name: string;
  limit: number;
  spent: number;
}

export interface Budget {
  _id?: string;
  userId?: string;
  month: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  savingsRatio: number;
  categories: BudgetCategory[];
}

export interface BudgetSummary {
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  remainingBudget: number;
  categories: Array<{
    name: string;
    limit: number;
    spent: number;
    remaining: number;
    percentage: number;
  }>;
  monthlyTrend: BudgetMonthlySummary;
}

export interface BudgetCategorySummary {
  category: string;
  spent: number;
  limit: number;
  percentage: number;
}

export interface BudgetMonthlySummary {
  currentMonth: number;
  previousMonth: number;
}

export interface BudgetResponse {
  success: boolean;
  data: Budget | null;
  message?: string;
}

export interface BudgetOverviewResponse {
  success: boolean;
  data: {
    hasBudget?: boolean;
    _id?: string;
    userId?: string;
    month?: string;
    totalBudget?: number;
    totalSpent?: number;
    remaining?: number;
    remainingBudget?: number;
    savingsRatio?: number;
    categories?: Array<{ name: string; limit: number; spent?: number }>;
    totalAllocated?: number;
    categorySummary?: BudgetCategorySummary[];
    monthlySummary?: BudgetMonthlySummary;
  } | null;
  message?: string;
}

export interface BudgetSummaryResponse {
  success: boolean;
  data: BudgetSummary;
}

export interface BudgetCategorySummaryResponse {
  success: boolean;
  data: BudgetCategorySummary[];
}

export interface BudgetMonthlySummaryResponse {
  success: boolean;
  data: BudgetMonthlySummary;
}

export interface CreateBudgetDto {
  month: string;
  totalBudget: number;
  categories: { name: string; limit: number }[];
}

// ---------- Service ----------

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private API = `${environment.API_URL}/budget`;
  private LEGACY_API = `${environment.API_URL}/budgets`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private getAuthHeaders() {
    const token = this.auth.getToken();
    if (!token) return {};
    return { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
  }

  private monthNow(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private toBudgetModel(raw: any, fallbackMonth?: string): Budget {
    return {
      _id: raw?._id,
      userId: raw?.userId,
      month: String(raw?.month || fallbackMonth || this.monthNow()),
      totalBudget: Number(raw?.totalBudget || 0),
      totalSpent: Number(raw?.totalSpent || 0),
      remaining: Number(raw?.remaining ?? raw?.remainingBudget ?? 0),
      savingsRatio: Number(raw?.savingsRatio || 0),
      categories: Array.isArray(raw?.categories)
        ? raw.categories.map((c: any) => ({
            name: String(c?.name || 'Other'),
            limit: Number(c?.limit || 0),
            spent: Number(c?.spent || 0),
          }))
        : [],
    };
  }

  /**
   * GET /api/v1/budget?month=YYYY-MM
   * Returns null if no budget exists for that month.
   */
  getCurrent(month?: string): Observable<Budget | null> {
    const url = month ? `${this.API}?month=${month}` : `${this.API}`;
    return this.http.get<BudgetOverviewResponse>(url, this.getAuthHeaders()).pipe(
      map((res) => {
        const data: any = res?.data;
        if (!data) return null;
        const hasBudget = typeof data.hasBudget === 'boolean'
          ? data.hasBudget
          : !!data._id || Number(data.totalBudget || 0) > 0 || (Array.isArray(data.categories) && data.categories.length > 0);
        if (!hasBudget) return null;
        return this.toBudgetModel(data, month);
      }),
      catchError(() => {
        const legacyUrl = month ? `${this.LEGACY_API}/current?month=${month}` : `${this.LEGACY_API}/current`;
        return this.http.get<BudgetResponse>(legacyUrl, this.getAuthHeaders()).pipe(
          map((res: any) => (res?.data ? this.toBudgetModel(res.data, month) : null)),
          catchError((err) => throwError(() => err))
        );
      })
    );
  }

  /**
   * GET /api/v1/budget/summary?month=YYYY-MM
   * Returns enriched summary with previous month comparison.
   */
  getSummary(month?: string): Observable<BudgetSummary | null> {
    const url = month ? `${this.API}/summary?month=${month}` : `${this.API}/summary`;
    return this.http.get<BudgetSummaryResponse>(url, this.getAuthHeaders()).pipe(
      map(res => res?.data ?? null),
      catchError(() => {
        const legacyUrl = month ? `${this.LEGACY_API}/summary?month=${month}` : `${this.LEGACY_API}/summary`;
        return this.http.get<BudgetSummaryResponse>(legacyUrl, this.getAuthHeaders()).pipe(
          map((res) => res?.data ?? null),
          catchError((err) => throwError(() => err))
        );
      })
    );
  }

  /**
   * GET /api/v1/budget/category-summary?month=YYYY-MM
   */
  getCategorySummary(month?: string): Observable<BudgetCategorySummary[]> {
    const url = month ? `${this.API}/category-summary?month=${month}` : `${this.API}/category-summary`;
    return this.http.get<BudgetCategorySummaryResponse | BudgetCategorySummary[]>(url, this.getAuthHeaders()).pipe(
      map((res: any) => Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : [])),
      catchError(() => {
        const legacyUrl = month ? `${this.LEGACY_API}/category-summary?month=${month}` : `${this.LEGACY_API}/category-summary`;
        return this.http.get<BudgetCategorySummaryResponse | BudgetCategorySummary[]>(legacyUrl, this.getAuthHeaders()).pipe(
          map((res: any) => Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : [])),
          catchError((err) => throwError(() => err))
        );
      })
    );
  }

  /**
   * GET /api/v1/budget/monthly-summary?month=YYYY-MM
   */
  getMonthlySummary(month?: string): Observable<BudgetMonthlySummary> {
    const url = month ? `${this.API}/monthly-summary?month=${month}` : `${this.API}/monthly-summary`;
    return this.http.get<BudgetMonthlySummaryResponse | BudgetMonthlySummary>(url, this.getAuthHeaders()).pipe(
      map((res: any) => {
        const data = res?.data ? res.data : res;
        return {
          currentMonth: Number(data?.currentMonth || 0),
          previousMonth: Number(data?.previousMonth || 0),
        } as BudgetMonthlySummary;
      }),
      catchError(() => {
        const legacyUrl = month ? `${this.LEGACY_API}/monthly-summary?month=${month}` : `${this.LEGACY_API}/monthly-summary`;
        return this.http.get<BudgetMonthlySummaryResponse | BudgetMonthlySummary>(legacyUrl, this.getAuthHeaders()).pipe(
          map((res: any) => {
            const data = res?.data ? res.data : res;
            return {
              currentMonth: Number(data?.currentMonth || 0),
              previousMonth: Number(data?.previousMonth || 0),
            } as BudgetMonthlySummary;
          }),
          catchError((err) => throwError(() => err))
        );
      })
    );
  }

  /**
   * POST /api/v1/budget
   * Creates or updates a budget for the given month (upsert).
   */
  createOrUpdate(payload: CreateBudgetDto): Observable<BudgetResponse> {
    return this.upsertBudget(payload);
  }

  getBudget(month?: string): Observable<Budget | null> {
    return this.getCurrent(month);
  }

  createBudget(payload: CreateBudgetDto): Observable<BudgetResponse> {
    return this.http.post<BudgetResponse>(`${this.API}`, payload, this.getAuthHeaders());
  }

  upsertBudget(payload: CreateBudgetDto): Observable<BudgetResponse> {
    return this.http.post<BudgetResponse>(`${this.API}/upsert`, payload, this.getAuthHeaders());
  }

  /**
   * PUT /api/v1/budget/:id
   */
  updateBudget(id: string, payload: Partial<CreateBudgetDto>): Observable<BudgetResponse> {
    return this.http.put<BudgetResponse>(`${this.API}/${id}`, payload, this.getAuthHeaders());
  }

  /**
   * DELETE /api/v1/budget/:id
   */
  deleteBudget(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.API}/${id}`, this.getAuthHeaders());
  }

  summary(month?: string): Observable<BudgetSummary | null> {
    return this.getSummary(month);
  }

  /**
   * Helper: get previous month's budget for comparison.
   */
  getPreviousMonth(currentMonth: string): Observable<Budget | null> {
    const [year, month] = currentMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    return this.getCurrent(prevMonthStr);
  }
}
