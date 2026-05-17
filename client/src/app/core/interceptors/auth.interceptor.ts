import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

function getPathname(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    try { return new URL(url).pathname; } catch { /* fall through */ }
  }
  return url;
}

const PUBLIC_AUTH_PATHS = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/refresh',
]);

function isPublicAuthPath(path: string): boolean {
  return PUBLIC_AUTH_PATHS.has(path);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  const path = getPathname(req.url);
  const isApi = path.startsWith('/api'); 
  const skipAttach = isPublicAuthPath(path);

  let outReq = req;

  if (isApi && !skipAttach) {
    let token = auth.getToken?.();

    if (!token && isPlatformBrowser(platformId)) {
      token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    }

    const baseHeaders: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };

    outReq = token
      ? req.clone({ setHeaders: { ...baseHeaders, Authorization: `Bearer ${token}` } })
      : req.clone({ setHeaders: baseHeaders });
  }

  return next(outReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 0) {
          // Network/CORS/server down
          return throwError(() => err);
        }
        if (err.status === 401) {
          console.warn('[AuthInterceptor] 401 for', path, '- clearing session');
          auth.logout();
          router.navigate(['/auth/login']);
        }
      }
      return throwError(() => err);
    })
  );
};
