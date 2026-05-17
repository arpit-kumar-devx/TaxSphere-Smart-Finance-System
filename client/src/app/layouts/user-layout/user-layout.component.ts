import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LayoutService } from '../../core/services/layout.service';
import { SidebarComponent } from '../../core/components/sidebar/sidebar.component';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, SidebarComponent],
  template: `
    <div class="main-layout" ngSkipHydration>
      <!-- Mobile Navbar (Subtle) -->
      <nav class="mobile-nav mobile-only">
        <button class="hamburger" (click)="layout.toggleSidebar()" aria-label="Menu">☰</button>
        <span class="logo-sm">
          <img src="assets/images/taxsphere-icon.svg" alt="TaxSphere icon" />
          TaxSphere
        </span>
        <div class="nav-right">
           <button class="btn-icon" (click)="theme.toggleTheme()">🌓</button>
        </div>
      </nav>

      <app-sidebar *ngIf="!isAdminRoute"></app-sidebar>
      <div class="content-shell" [class.collapsed]="layout.isSidebarCollapsed()" [style.margin-left]="isAdminRoute ? '0' : ''">
        <main class="app-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { 
      --sidebar-width: 260px;
      --sidebar-collapsed-width: 84px;
      display: block; 
      height: 100vh; 
      overflow: hidden; 
    }
    
    .main-layout { 
      display: flex; 
      height: 100%; 
      background: var(--background-color, #0f172a); 
    }
    
    .content-shell { 
      flex: 1; 
      display: flex; 
      flex-direction: column; 
      overflow-y: auto; 
      transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .app-content { flex: 1; padding: 0; }
    
    @media (min-width: 1025px) {
      .content-shell { 
         margin-left: var(--sidebar-width); 
      }
      .content-shell.collapsed {
         margin-left: var(--sidebar-collapsed-width);
      }
    }

    .mobile-nav { 
      height: 60px; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.05); 
      display: flex; align-items: center; justify-content: space-between; padding: 0 1rem;
      position: sticky; top: 0; z-index: 990;
    }
    .mobile-nav .hamburger { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #fff; }
    .mobile-nav .logo-sm { font-weight: 800; font-size: 1.1rem; color: #6366f1; display: inline-flex; align-items: center; gap: 0.45rem; }
    .mobile-nav .logo-sm img { width: 20px; height: 20px; }

    @media (max-width: 1024px) {
      .content-shell { margin-left: 0 !important; }
    }
  `]
})
export class UserLayoutComponent {
  public auth = inject(AuthService);
  public theme = inject(ThemeService);
  public layout = inject(LayoutService);
  public router = inject(Router);
  public user$ = this.auth.currentUser$;
  public isAdminRoute = false;

  constructor() {
    this.updateAdminRoute();
    this.router.events.subscribe(() => {
      this.updateAdminRoute();
    });
  }

  private updateAdminRoute() {
    this.isAdminRoute = this.router.url.includes('/admin');
  }

  logout() {
    this.auth.logout();
  }
}
