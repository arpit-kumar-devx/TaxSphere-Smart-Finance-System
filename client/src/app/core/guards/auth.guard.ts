import { CanActivateFn, Router } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // If on server, we can't check localStorage, so let it pass through to hydration
  if (!isPlatformBrowser(platformId)) return true;

  if (authService.isAuthenticated()) {
    return true;
  }

  console.error('[AuthGuard] Redirecting to login — Unauthenticated access to:', state.url);
  router.navigate(['/auth/login']);
  return false;
};
