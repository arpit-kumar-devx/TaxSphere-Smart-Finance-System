import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';
import { AdminNotificationBellComponent } from '../notification-bell/admin-notification-bell.component';

@Component({
  selector: 'app-admin-topbar',
  standalone: true,
  imports: [CommonModule, AdminNotificationBellComponent],
  template: `
    <header class="admin-topbar">
      <h1>Admin Control Center</h1>
      <div class="actions">
        <app-admin-notification-bell></app-admin-notification-bell>
        <button class="logout" (click)="auth.logout()">Logout</button>
      </div>
    </header>
  `,
  styles: [`
    .admin-topbar { 
      height: 72px; 
      border-bottom: 1px solid rgba(255,255,255,.06); 
      display:flex; 
      align-items:center; 
      justify-content:space-between; 
      padding: 0 18px; 
      background: rgba(15,23,42,.72); 
      backdrop-filter: blur(8px); 
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .admin-topbar h1 { margin: 0; font-size: 20px; color: #fff; }
    .actions { display: flex; align-items: center; gap: 10px; }
    .logout { 
      border: 1px solid rgba(255,255,255,.15); 
      color: #e2e8f0; 
      background: transparent; 
      border-radius: 10px; 
      padding: 8px 12px; 
      cursor: pointer;
      transition: all 0.2s;
    }
    .logout:hover {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.3);
    }
  `]
})
export class AdminTopbarComponent {
  public auth = inject(AuthService);
}
