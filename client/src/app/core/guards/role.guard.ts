import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService, UserRole } from '../services/auth.service';
import { map, take } from 'rxjs';

/** Restrict route to one of the given roles (must be logged in — combine with authGuard). */
export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    if (!isPlatformBrowser(platformId)) return true; // Let hydration handle it


    return auth.currentUser$.pipe(
      take(1),
      map((user) => {
        // If not logged in at all, authGuard should've caught this, but fallback to login
        if (!user) {
          router.navigate(['/auth/login']);
          return false;
        }

        const role = user.role ?? 'USER';

        if (roles.includes(role)) {
          return true;
        }

        // If authorized for a different protected area, redirect to their own home
        console.warn(`[RoleGuard] Unauthorized access to route requiring ${roles.join(',')}. User role: ${role}`);
        
        if (role === 'ADMIN') {
          router.navigate(['/app/admin']);
        } else if (role === 'CA') {
          router.navigate(['/app/ca']);
        } else {
          router.navigate(['/app/dashboard']);
        }
        return false;
      })
    );
  };
}
