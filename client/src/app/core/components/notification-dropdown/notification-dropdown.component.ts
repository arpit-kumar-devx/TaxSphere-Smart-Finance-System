import { Component, OnInit, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, AppNotification } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notif-wrapper">
      <button class="bell-btn" (click)="toggleDropdown()" [class.has-unread]="unreadCount > 0">
        <i class="bell-icon"></i>
        <span class="badge" *ngIf="unreadCount > 0">{{ unreadCount }}</span>
      </button>

      <div class="dropdown-panel shadow-premium" *ngIf="isOpen">
        <div class="panel-head">
          <h3>Notifications</h3>
          <button class="btn-text" (click)="markAllRead()" *ngIf="unreadCount > 0">Mark all as read</button>
        </div>
        
        <div class="panel-body custom-scroll">
          <div class="notif-item" *ngFor="let n of notifications" [class.unread]="!n.read" (click)="markRead(n)">
            <div class="n-icon" [class]="n.type.toLowerCase()">
               <span *ngIf="n.type === 'SUCCESS'">✅</span>
               <span *ngIf="n.type === 'WARNING'">⚠️</span>
               <span *ngIf="n.type === 'ERROR'">🚨</span>
               <span *ngIf="n.type === 'INFO'">ℹ️</span>
            </div>
            <div class="n-content">
              <span class="n-title">{{ n.title }}</span>
              <span class="n-msg">{{ n.message }}</span>
              <span class="n-time">{{ n.createdAt | date:'shortTime' }}</span>
            </div>
          </div>

          <div class="empty-notif" *ngIf="notifications.length === 0">
            <div class="empty-art">🔔</div>
            <p>You're all caught up!</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .notif-wrapper { position: relative; }
    
    .bell-btn { 
      background: rgba(255,255,255,0.05); border: none; width: 40px; height: 40px; 
      border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: 0.2s; position: relative; color: #94a3b8;
    }
    .bell-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .bell-btn.has-unread { color: #f59e0b; }

    .bell-icon {
      width: 20px; height: 20px; background-color: currentColor;
      mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>') center/contain no-repeat;
      -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>') center/contain no-repeat;
    }

    .badge {
      position: absolute; top: 0; right: 0; background: #ef4444; color: white;
      font-size: 0.6rem; font-weight: 800; min-width: 16px; height: 16px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      border: 2px solid #0f172a; transform: translate(30%, -30%);
    }

    .dropdown-panel {
      position: absolute; top: calc(100% + 12px); right: 0; width: 340px;
      background: #1e293b; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
      z-index: 1000; animation: slideUp 0.2s ease-out;
    }

    .panel-head { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .panel-head h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #f1f5f9; }
    .btn-text { background: none; border: none; color: #6366f1; font-size: 0.75rem; font-weight: 600; cursor: pointer; padding: 0; }

    .panel-body { max-height: 400px; overflow-y: auto; padding: 0.5rem; }
    .notif-item {
      display: flex; gap: 1rem; padding: 1rem; border-radius: 12px; cursor: pointer;
      transition: 0.2s; position: relative;
    }
    .notif-item:hover { background: rgba(255,255,255,0.03); }
    .notif-item.unread { background: rgba(99, 102, 241, 0.04); }
    .notif-item.unread::after { content: ''; position: absolute; right: 1rem; top: 1.25rem; width: 6px; height: 6px; background: #6366f1; border-radius: 50%; }

    .n-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; flex-shrink: 0; }
    .n-icon.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    
    .n-content { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .n-title { font-size: 0.85rem; font-weight: 700; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .n-msg { font-size: 0.8rem; color: #94a3b8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .n-time { font-size: 0.7rem; color: #64748b; margin-top: 4px; }

    .empty-notif { text-align: center; padding: 3rem 1rem; color: #64748b; }
    .empty-art { font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.2; }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class NotificationDropdownComponent implements OnInit {
  private notifSvc = inject(NotificationService);
  private elementRef = inject(ElementRef);
  
  notifications: AppNotification[] = [];
  unreadCount = 0;
  isOpen = false;

  ngOnInit(): void {
    this.notifSvc.notifications$.subscribe(n => this.notifications = n);
    this.notifSvc.unreadCount$.subscribe(c => this.unreadCount = c);
  }

  toggleDropdown() { this.isOpen = !this.isOpen; }

  @HostListener('document:click', ['$event'])
  outsideClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  markRead(n: AppNotification) {
    if (!n.read) {
      this.notifSvc.markAsRead(n._id).subscribe();
    }
  }

  markAllRead() {
    this.notifSvc.markAllAsRead().subscribe();
  }
}
