import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  public layout = inject(LayoutService);
  public auth = inject(AuthService);
  private router = inject(Router);
  public user$ = this.auth.currentUser$;
  
  isCollapsed = false;

  get role() { return this.auth.getCurrentUser()?.role; }

  toggleCollapse() { 
    this.isCollapsed = !this.isCollapsed;
    // Notify layout if needed, though most layout shifts are handled by the shifted container
  }

  closeMobileNavIfSmall() { 
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      this.layout.closeSidebar();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.layout.isSidebarOpen()) {
      this.layout.closeSidebar();
    }
  }

  logout(e: Event) { 
    e.stopPropagation();
    e.preventDefault(); 
    this.auth.logout(); 
  }

  openProfile(e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.router.navigate(['/app/settings/profile']);
    this.closeMobileNavIfSmall();
  }

  resolvePhoto(photoPath?: string): string {
    if (!photoPath) return '';
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://') || photoPath.startsWith('/')) {
      return photoPath;
    }
    return `/${photoPath.replace(/^\/+/, '')}`;
  }

  getAnalyticsRoute(): string {
    const role = (this.auth.getCurrentUser()?.role || 'USER').toUpperCase();
    if (role === 'ADMIN') return '/app/admin/analytics';
    if (role === 'CA') return '/app/ca/analytics';
    return '/app/financial-reports';
  }
}
