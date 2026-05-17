import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminUserService } from '../../../../core/services/admin-user.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="view-header">
      <div class="h-main">
        <h2>Team Control</h2>
        <p>Manage users, assign roles and control access</p>
      </div>
      <div class="h-actions">
        <input type="text" [(ngModel)]="searchTerm" placeholder="Search by name or email..." class="search-box">
        <select [(ngModel)]="roleFilter" class="filter-select">
          <option value="ALL">All Roles</option>
          <option value="USER">User</option>
          <option value="CA">Professional CA</option>
          <option value="ADMIN">Administrator</option>
        </select>
        <select [(ngModel)]="statusFilter" class="filter-select">
          <option value="ALL">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
    </div>

    <div class="table-container shadow-premium">
      <table class="premium-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Joined</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let u of filteredUsers">
            <td>
              <div class="u-info">
                <div class="avatar">{{ u.name[0] }}</div>
                <div class="u-details">
                  <span class="u-name">{{ u.name }}</span>
                  <span class="u-email">{{ u.email }}</span>
                </div>
              </div>
            </td>
            <td>
              <select [ngModel]="u.role" (ngModelChange)="updateRole(u.id, $event)" class="role-badge" [class]="u.role.toLowerCase()">
                <option value="USER">USER</option>
                <option value="CA">CA</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </td>
            <td>{{ u.createdAt | date:'MMM d, y' }}</td>
            <td>
              <span class="status-indicator" [class]="u.status">
                {{ u.status || 'active' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-icon" (click)="selectedUser = u" title="View profile">👁️</button>
              <button class="btn-icon" (click)="toggleStatus(u)" [title]="u.status === 'suspended' ? 'Activate' : 'Suspend'">
                {{ u.status === 'suspended' ? '🔓' : '🚫' }}
              </button>
            </td>
          </tr>
          <tr *ngIf="filteredUsers.length === 0">
            <td colspan="5" class="empty-state">No users found matching your filters.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="modal-overlay" *ngIf="selectedUser" (click)="selectedUser = null">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <h3>{{ selectedUser.name }}</h3>
        <p>{{ selectedUser.email }}</p>
        <p>Role: {{ selectedUser.role }}</p>
        <p>Status: {{ selectedUser.status || 'active' }}</p>
        <button class="btn-icon" (click)="selectedUser = null">Close</button>
      </div>
    </div>
  `,
  styles: [`
    .view-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; }
    .h-main h2 { font-size: 1.75rem; font-weight: 800; margin: 0; }
    .h-main p { color: #64748b; margin: 0.25rem 0 0 0; }
    
    .h-actions { display: flex; gap: 1rem; }
    .search-box { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1.25rem; border-radius: 12px; color: #fff; width: 260px; outline: none; transition: 0.2s; }
    .search-box:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
    .filter-select { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1rem; border-radius: 12px; color: #fff; outline: none; cursor: pointer; }

    .table-container { background: #1e293b; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
    .premium-table { width: 100%; border-collapse: collapse; text-align: left; }
    .premium-table th { padding: 1.25rem 1.5rem; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .premium-table td { padding: 1.25rem 1.5rem; vertical-align: middle; border-bottom: 1px solid rgba(255,255,255,0.03); }
    
    .u-info { display: flex; align-items: center; gap: 1rem; }
    .avatar { width: 40px; height: 40px; background: rgba(99, 102, 241, 0.2); color: #6366f1; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .u-details { display: flex; flex-direction: column; }
    .u-name { font-weight: 700; color: #f1f5f9; }
    .u-email { font-size: 0.8rem; color: #64748b; }

    .role-badge { background: #334155; color: #94a3b8; border: none; padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.7rem; font-weight: 800; cursor: pointer; transition: 0.2s; }
    .role-badge.admin { color: #f59e0b; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); }
    .role-badge.ca { color: #6366f1; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); }

    .status-indicator { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; }
    .status-indicator.active { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .status-indicator.suspended { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

    .btn-icon { background: rgba(255,255,255,0.05); border: none; padding: 0.5rem; border-radius: 10px; cursor: pointer; transition: 0.2s; color: #94a3b8; }
    .btn-icon:hover { background: rgba(255,255,255,0.1); color: #fff; }

    .empty-state { text-align: center; color: #64748b; padding: 4rem !important; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; z-index: 20; }
    .modal-card { background:#1e293b; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 18px; width: 320px; }
  `]
})
export class AdminUsersComponent implements OnInit {
  users: any[] = [];
  searchTerm = '';
  roleFilter = 'ALL';
  statusFilter = 'ALL';
  selectedUser: any | null = null;
  private myUserId = '';

  constructor(
    private adminUsers: AdminUserService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.auth.currentUser$.subscribe((u) => this.myUserId = String((u as any)?.id || (u as any)?._id || ''));
    this.fetch();
  }

  fetch() {
    this.adminUsers.list().subscribe(res => this.users = res.items || []);
  }

  get filteredUsers() {
    return this.users.filter(u => {
      const matchSearch = !this.searchTerm || 
        u.name.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
        u.email.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchRole = this.roleFilter === 'ALL' || u.role === this.roleFilter;
      const matchStatus = this.statusFilter === 'ALL' || (u.status || 'active') === this.statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }

  updateRole(userId: string, role: string) {
    this.adminUsers.updateRole(userId, role).subscribe({
      next: () => {
        this.toast.success('Role updated');
        this.fetch();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Role update failed'),
    });
  }

  toggleStatus(user: any) {
    if (user.id === this.myUserId) {
      this.toast.error('You cannot suspend your own admin account');
      return;
    }
    const action = user.status === 'suspended' ? 'activate' : 'suspend';
    if (!confirm(`Are you sure you want to ${action} ${user.name}?`)) {
      return;
    }
    const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
    this.adminUsers.updateStatus(user.id, newStatus).subscribe({
      next: () => {
        this.toast.success(`User ${action}d successfully`);
        this.fetch();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Status update failed'),
    });
  }
}
