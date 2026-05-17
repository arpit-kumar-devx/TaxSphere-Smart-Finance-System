import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminAuditService } from '../../../../core/services/admin-audit.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="view-header">
      <div class="h-main">
        <h2>System Audit</h2>
        <p>Security and activity timeline for administrative actions</p>
      </div>
      <div>
        <input [(ngModel)]="searchTerm" placeholder="Search logs" class="search">
      </div>
    </div>

    <div class="log-timeline shadow-premium">
      <div class="log-item" *ngFor="let l of filteredLogs; trackBy: trackByLogId">
        <div class="log-meta">
          <div class="severity-dot" [class]="l.severity"></div>
          <span class="l-date">{{ l.createdAt | date:'MMM d, HH:mm:ss' }}</span>
        </div>
        <div class="log-content">
          <span class="l-admin">{{ l.adminId.name || 'Unknown Admin' }}</span>
          <span class="l-action">{{ l.action }}</span>
          <span class="l-details">{{ l.details }}</span>
          <div class="l-target">
            <span class="t-type">{{ l.targetType }}:</span>
            <span class="t-id">{{ l.targetId }}</span>
          </div>
        </div>
      </div>
      
      <div class="empty-state" *ngIf="logs.length === 0">
        No administrative actions recorded yet.
      </div>
    </div>
  `,
  styles: [`
    .view-header { margin-bottom: 2rem; }
    .h-main h2 { font-size: 1.75rem; font-weight: 800; margin: 0; }
    .h-main p { color: #64748b; margin: 0.25rem 0 0 0; }

    .log-timeline { background: #1e293b; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
    .log-item { display: flex; padding: 1.25rem 2rem; border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.2s; }
    .log-item:hover { background: rgba(255,255,255,0.02); }

    .log-meta { width: 160px; display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
    .severity-dot { width: 10px; height: 10px; border-radius: 50%; background: #94a3b8; }
    .severity-dot.low { background: #10b981; }
    .severity-dot.medium { background: #6366f1; }
    .severity-dot.high { background: #f59e0b; }
    .severity-dot.critical { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    
    .l-date { font-size: 0.75rem; color: #64748b; font-weight: 600; }

    .log-content { flex: 1; display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
    .l-admin { font-weight: 700; font-size: 0.9rem; color: #f1f5f9; min-width: 120px; }
    .l-action { background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; color: #94a3b8; }
    .l-details { font-size: 0.85rem; color: #94a3b8; flex: 1; min-width: 200px; }
    
    .l-target { font-size: 0.75rem; display: flex; gap: 4px; }
    .t-type { color: #64748b; }
    .t-id { color: #6366f1; font-weight: 600; }

    .empty-state { text-align: center; color: #64748b; padding: 4rem; }
    .search { background:#1e293b; border:1px solid rgba(255,255,255,.1); color:#fff; padding:.6rem .8rem; border-radius:10px; }
  `]
})
export class AdminAuditLogsComponent implements OnInit {
  logs: any[] = [];
  searchTerm = '';

  constructor(private adminAudit: AdminAuditService) {}

  ngOnInit(): void {
    this.adminAudit.list().subscribe(res => this.logs = res.items || []);
  }

  get filteredLogs(): any[] {
    if (!this.searchTerm) return this.logs;
    const q = this.searchTerm.toLowerCase();
    return this.logs.filter((l) =>
      `${l.action} ${l.details} ${l.targetType} ${l.targetId} ${l?.adminId?.name || ''}`.toLowerCase().includes(q)
    );
  }

  trackByLogId(index: number, item: any): string {
    return item._id;
  }
}
