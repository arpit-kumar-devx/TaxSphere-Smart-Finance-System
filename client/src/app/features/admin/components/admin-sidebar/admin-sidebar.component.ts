import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside class="admin-sidebar" [class.collapsed]="collapsed" *ngIf="user$ | async as me">
      <div class="sidebar-inner">
        <div class="brand">
          <div class="logo">TS</div>
          <div class="meta" *ngIf="!collapsed">
            <h2>TaxSphere</h2>
            <p>Admin Console</p>
          </div>
          <button class="collapse" (click)="toggleCollapse()" [title]="collapsed ? 'Expand' : 'Collapse'">
            {{ collapsed ? '→' : '←' }}
          </button>
        </div>

        <div class="profile-card" [title]="me.email">
          <div class="avatar">{{ (me.name || 'A').charAt(0) }}</div>
          <div class="info" *ngIf="!collapsed">
            <div class="name">{{ me.name }}</div>
            <div class="tag">SYSTEM ADMIN</div>
          </div>
        </div>

        <nav class="nav">
          <a routerLink="/app/admin/analytics" routerLinkActive="active" [title]="collapsed ? 'Analytics' : ''"><span>📊</span><em *ngIf="!collapsed">Analytics</em></a>
          <a routerLink="/app/admin/users" routerLinkActive="active" [title]="collapsed ? 'Users & Roles' : ''"><span>👤</span><em *ngIf="!collapsed">Users & Roles</em></a>
          <a routerLink="/app/admin/itrs" routerLinkActive="active" [title]="collapsed ? 'ITR Registry' : ''"><span>📁</span><em *ngIf="!collapsed">ITR Registry</em></a>
          <a routerLink="/app/admin/audit-logs" routerLinkActive="active" [title]="collapsed ? 'Audit Logs' : ''"><span>📜</span><em *ngIf="!collapsed">Audit Logs</em></a>
          <a routerLink="/app/admin/settings" routerLinkActive="active" [title]="collapsed ? 'System Settings' : ''"><span>⚙️</span><em *ngIf="!collapsed">System Settings</em></a>
        </nav>

        <div class="security" *ngIf="!collapsed">Security posture: <strong>Protected</strong></div>
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }

    .admin-sidebar { width: 100%; height: 100%; background: #0f172a; border-right: 1px solid rgba(255,255,255,.07); transition: width .25s; }
    
    .sidebar-inner {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Scrollbar Styling */
    .sidebar-inner::-webkit-scrollbar { width: 4px; }
    .sidebar-inner::-webkit-scrollbar-track { background: transparent; }
    .sidebar-inner::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    
    .admin-sidebar.collapsed { width: 100%; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-weight: 800; }
    .meta h2 { margin: 0; font-size: 18px; }
    .meta p { margin: 0; color: #94a3b8; font-size: 11px; }
    .collapse { margin-left: auto; border: 1px solid rgba(255,255,255,.08); background: transparent; color: #cbd5e1; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; }
    .profile-card { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 10px; }
    .avatar { width: 34px; height: 34px; border-radius: 10px; background: #334155; display:flex; align-items:center; justify-content:center; font-weight: 700; }
    .name { font-weight: 700; }
    .tag { font-size: 10px; color: #22c55e; font-weight: 800; }
    .nav { display: flex; flex-direction: column; gap: 6px; }
    .nav a { display:flex; align-items:center; gap: 10px; padding: 10px 12px; border-radius: 12px; color: #94a3b8; text-decoration:none; border: 1px solid transparent; }
    .nav a.active { background: linear-gradient(135deg, rgba(99,102,241,.26), rgba(139,92,246,.2)); color: #fff; border-color: rgba(99,102,241,.4); }
    .nav a:hover { color: #fff; background: rgba(255,255,255,.03); }
    .nav em { font-style: normal; }
    .security { margin-top: auto; font-size: 12px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }

    @media (max-width: 1024px) {
      .admin-sidebar { width: 88px; }
      .admin-sidebar .meta, .admin-sidebar .info, .admin-sidebar .security { display:none; }
    }
  `]
})
export class AdminSidebarComponent {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();
  
  public auth = inject(AuthService);
  public user$ = this.auth.currentUser$;

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
}
