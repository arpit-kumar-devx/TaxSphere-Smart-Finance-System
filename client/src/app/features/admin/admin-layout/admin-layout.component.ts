import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AdminSidebarComponent } from '../components/admin-sidebar/admin-sidebar.component';
import { AdminTopbarComponent } from '../components/admin-topbar/admin-topbar.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, AdminSidebarComponent, AdminTopbarComponent],
  template: `
    <div class="admin-layout" [class.sidebar-collapsed]="collapsed">
      <app-admin-sidebar [(collapsed)]="collapsed"></app-admin-sidebar>
      
      <main class="admin-main">
        <app-admin-topbar></app-admin-topbar>
        
        <section class="admin-content">
          <router-outlet></router-outlet>
        </section>
      </main>
    </div>
  `,
  styleUrls: ['./admin-layout.component.css'],
})
export class AdminLayoutComponent {
  public auth = inject(AuthService);
  public user$ = this.auth.currentUser$;
  collapsed = false;

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
  }
}
