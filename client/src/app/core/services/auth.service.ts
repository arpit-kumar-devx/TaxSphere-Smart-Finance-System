// src/app/core/services/auth.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

export type UserRole = 'USER' | 'CA' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  profilePhoto?: string;
  phone?: string;
  country?: string;
  city?: string;
  status?: 'active' | 'suspended';
  createdAt?: string;
  income_bracket?: 'low' | 'middle' | 'high';
  role?: UserRole;
  updatedAt?: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  accessToken?: string;
  user: User;
  data?: { token?: string; accessToken?: string; user?: User };
}

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest {
  name: string; email: string; password: string;
  confirmPassword: string;
  country: string;
  incomeBracket: 'low' | 'middle' | 'high';
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data?: { user?: User };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'token';
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly USER_KEY  = 'user';
  private readonly API_URL   = `${environment.API_URL}/auth`;

  private tokenSubject: BehaviorSubject<string | null>;
  private currentUserSubject: BehaviorSubject<User | null>;

  /** Streams */
  public token$: Observable<string | null>;
  public currentUser$: Observable<User | null>;

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    const initialToken = this.getRawToken();
    const initialUser = this.getRawUser();

    this.tokenSubject = new BehaviorSubject<string | null>(initialToken);
    this.currentUserSubject = new BehaviorSubject<User | null>(initialUser);

    this.token$ = this.tokenSubject.asObservable();
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  private getRawToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(this.TOKEN_KEY) ?? localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  private getRawUser(): User | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const s = localStorage.getItem(this.USER_KEY);
    if (!s) return null;
    try {
      const u = JSON.parse(s);
      return { ...u, role: u.role ?? 'USER' };
    } catch {
      return null;
    }
  }

  // ---------- Auth actions ----------
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, credentials).pipe(
      tap(res => this.saveAuth(res))
    );
  }

  register(userData: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.API_URL}/register`, userData);
  }

  forgotPassword(email: string) {
    return this.http.post<{ message: string }>(`${this.API_URL}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string) {
    return this.http.post<AuthResponse>(`${this.API_URL}/reset-password`, { token, password })
      .pipe(tap(res => this.saveAuth(res)));
  }

  /** Uses your auth middleware to return the user from token */
  verifyToken(): Observable<{ user: User }> {
    return this.http
      .get<{ success?: boolean; user?: User; data?: User }>(`${this.API_URL}/me`)
      .pipe(
        map(r => {
          const u = r.user ?? r.data;
          if (!u) throw new Error('Invalid /me response');
          return { user: { ...u, role: u.role ?? 'USER' } };
        }),
        tap(r => this.saveUser(r.user))
      );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.tokenSubject.next(null);
    this.currentUserSubject.next(null);
    this.router.navigate(['/auth/login']);
  }

  // ---------- Consumers rely on these ----------
  getToken(): string | null {
    return isPlatformBrowser(this.platformId)
      ? (localStorage.getItem(this.TOKEN_KEY) ?? localStorage.getItem(this.ACCESS_TOKEN_KEY))
      : null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (token) return true;
    console.warn('[AuthService] No token found in localStorage or subject.');
    return false;
  }

  getCurrentUser(): User | null {
    if (!this.currentUserSubject.value) {
      const u = this.getRawUser();
      if (u) this.currentUserSubject.next(u);
    }
    return this.currentUserSubject.value;
  }

  updateCurrentUser(partial: Partial<User>): void {
    const current = this.getCurrentUser();
    if (!current) return;
    this.saveUser({ ...current, ...partial });
  }

  // ---------- Storage helpers ----------
  private saveAuth(res: AuthResponse) {
    const token = res?.token ?? res?.accessToken ?? res?.data?.token ?? res?.data?.accessToken ?? null;
    const user = res?.user ?? res?.data?.user ?? null;

    if (!token || !user) {
      console.error('[AuthService] Invalid auth response payload:', res);
      throw new Error('INVALID_AUTH_RESPONSE');
    }

    this.setToken(token);
    this.saveUser({ ...user, role: user.role ?? 'USER' });
  }

  private setToken(token: string) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
    }
    this.tokenSubject.next(token);
  }

  private saveUser(user: User) {
    const normalized: User = { ...user, role: user.role ?? 'USER' };
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(normalized));
    }
    this.currentUserSubject.next(normalized);
  }


}
