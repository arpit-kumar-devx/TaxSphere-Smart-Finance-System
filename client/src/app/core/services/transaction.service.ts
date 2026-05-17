import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environments';

export interface Transaction {
  _id: string;
  user_id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransactionRequest {
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date?: Date | string;
  description?: string;
}

export interface UpdateTransactionRequest {
  type?: 'income' | 'expense';
  category?: string;
  amount?: number;
  date?: Date | string;
  description?: string;
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  type?: 'income' | 'expense';
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: 'date' | 'createdAt' | 'amount';
  sortDir?: 'asc' | 'desc';
  sortOrder?: 'asc' | 'desc'; // backend also accepts sortOrder
}

export interface TransactionSummary {
  typeStats: Array<{ _id: 'income' | 'expense'; total: number; count: number }>;
  categoryStats: Array<{ _id: string; total: number; count: number }>;
}

export interface TransactionResponse {
  transactions: Transaction[];
  totalPages: number;
  currentPage: number;
  total: number;
}

export interface ExpenseAnalyticsTransaction {
  _id?: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
}

type TransactionDTO = Omit<Transaction, 'date' | 'createdAt' | 'updatedAt'> & {
  date: string;
  createdAt: string;
  updatedAt: string;
};
interface TransactionResponseDTO extends Omit<TransactionResponse, 'transactions'> {
  transactions?: TransactionDTO[];
  data?: TransactionDTO[];
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly BASE =
    (environment as any)?.API_URL && typeof (environment as any).API_URL === 'string'
      ? (environment as any).API_URL
      : '/api/v1';

  private readonly API = `${this.BASE}/transactions`;
  readonly transactionUpdates$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  private toISO(d?: Date | string): string | undefined {
    if (!d) return undefined;
    return typeof d === 'string' ? d : d.toISOString();
  }

  private fromDTO(t: TransactionDTO): Transaction {
    return {
      ...t,
      date: new Date(t.date),
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    };
  }

  private buildParams(filters?: TransactionFilters): HttpParams {
    let params = new HttpParams();
    if (!filters) return params;
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return params;
  }

  private normalizeExpenseRows(payload: unknown): ExpenseAnalyticsTransaction[] {
    const raw = payload as any;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.transactions)
      ? raw.transactions
      : [];

    return list
      .map((row: any) => {
        const amount = Number(row?.amount ?? 0);
        const dateValue = row?.date ?? row?.createdAt;
        const parsedDate = dateValue ? new Date(dateValue) : null;
        const date =
          parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : '';
        if (!Number.isFinite(amount) || !date) return null;

        return {
          _id: row?._id,
          category: String(row?.category ?? 'Uncategorized'),
          amount,
          date,
          description: row?.description ?? row?.source ?? undefined,
        } as ExpenseAnalyticsTransaction;
      })
      .filter((row: ExpenseAnalyticsTransaction | null): row is ExpenseAnalyticsTransaction => !!row);
  }

  // ---------- Queries ----------
  getTransactions(filters?: TransactionFilters): Observable<TransactionResponse> {
    const params = this.buildParams(filters);
    return this.http.get<TransactionResponseDTO>(this.API, { params }).pipe(
      map((r) => {
        const rows = Array.isArray(r.transactions)
          ? r.transactions
          : Array.isArray(r.data)
            ? r.data
            : [];
        return {
          transactions: rows.map((t) => this.fromDTO(t)),
          totalPages: Number((r as any).totalPages || 1),
          currentPage: Number((r as any).currentPage || 1),
          total: Number((r as any).total || rows.length),
        };
      })
    );
  }

  getRecentTransactions(limit = 8): Observable<Transaction[]> {
    const params: TransactionFilters = { page: 1, limit, sortBy: 'date', sortDir: 'desc' };
    return this.getTransactions(params).pipe(
      map((r) => [...r.transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit))
    );
  }

  getExpenseTransactionsForAnalytics(limit = 1000): Observable<ExpenseAnalyticsTransaction[]> {
    const params = this.buildParams({ limit });
    return this.http.get<unknown>(`${this.API}/expenses`, { params }).pipe(
      map((res) => this.normalizeExpenseRows(res)),
      catchError((err) => {
        if (err?.status === 401) {
          return throwError(() => err);
        }
        return this.getTransactions({ type: 'expense', limit, sortBy: 'date', sortDir: 'desc' }).pipe(
          map((res) =>
            res.transactions.map((tx) => ({
              _id: tx._id,
              category: tx.category || 'Uncategorized',
              amount: Number(tx.amount || 0),
              date: tx.date instanceof Date ? tx.date.toISOString() : new Date(tx.date).toISOString(),
              description: tx.description || undefined,
            }))
          )
        );
      })
    );
  }

  getExpenses(limit = 1000): Observable<{ data: ExpenseAnalyticsTransaction[] }> {
    return this.getExpenseTransactionsForAnalytics(limit).pipe(
      map((rows) => ({ data: rows }))
    );
  }

  notifyTransactionUpdate(): void {
    this.transactionUpdates$.next();
  }

  getTransaction(id: string): Observable<Transaction> {
    return this.http
      .get<TransactionDTO>(`${this.API}/${encodeURIComponent(id)}`)
      .pipe(map(this.fromDTO.bind(this)));
  }

  // ---------- Commands ----------
  createTransaction(
    payload: CreateTransactionRequest
  ): Observable<{ message: string; transaction: Transaction }> {
    const body = { ...payload, date: this.toISO(payload.date) };
    return this.http
      .post<{ message: string; transaction: TransactionDTO }>(this.API, body)
      .pipe(
        map((res) => ({ message: res.message, transaction: this.fromDTO(res.transaction) })),
        tap(() => this.notifyTransactionUpdate())
      );
  }

  updateTransaction(
    id: string,
    payload: UpdateTransactionRequest
  ): Observable<{ message: string; transaction: Transaction }> {
    const body = { ...payload, date: this.toISO(payload.date) };
    return this.http
      .put<{ message: string; transaction: TransactionDTO }>(`${this.API}/${encodeURIComponent(id)}`, body)
      .pipe(
        map((res) => ({ message: res.message, transaction: this.fromDTO(res.transaction) })),
        tap(() => this.notifyTransactionUpdate())
      );
  }

  /** Delete a single transaction by id */
  deleteTransaction(id: string): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`${this.API}/${encodeURIComponent(id)}`)
      .pipe(tap(() => this.notifyTransactionUpdate()));
  }

  /** Delete ALL transactions for the authenticated user */
  deleteAll(): Observable<{ message: string; deletedCount: number }> {
    return this.http
      .delete<{ message: string; deletedCount: number }>(this.API)
      .pipe(tap(() => this.notifyTransactionUpdate()));
  }

  getTransactionSummary(startDate?: string, endDate?: string): Observable<TransactionSummary> {
    const params = this.buildParams({ startDate, endDate });
    return this.http.get<TransactionSummary>(`${this.API}/summary/stats`, { params });
  }
}
