import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval, startWith } from 'rxjs';
import { AdminNotificationService } from '../../../../core/services/admin-notification.service';

@Component({
  selector: 'app-admin-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bell-wrap">
      <button class="bell" (click)="open = !open">🔔 <span class="count" *ngIf="unreadCount">{{ unreadCount }}</span></button>
      <div class="panel" *ngIf="open">
        <div class="head">
          <strong>Notifications</strong>
          <button (click)="markAllRead()">Mark all read</button>
        </div>
        <div class="empty" *ngIf="!items.length">No notifications</div>
        <div class="item" *ngFor="let n of items">
          <div>
            <p>{{ n.title }}</p>
            <small>{{ n.message }}</small>
          </div>
          <button *ngIf="!n.read" (click)="markRead(n._id)">✓</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bell-wrap { position: relative; }
    .bell { border: 1px solid rgba(255,255,255,.14); background: transparent; color: #e2e8f0; border-radius: 10px; padding: 8px 10px; position: relative; }
    .count { position: absolute; top: -6px; right: -6px; font-size: 10px; background:#ef4444; color:#fff; border-radius: 999px; min-width: 16px; height: 16px; display:flex; align-items:center; justify-content:center; }
    .panel { position: absolute; right: 0; top: 42px; width: 320px; background: #0f172a; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; z-index: 10; max-height: 360px; overflow: auto; }
    .head { display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .head button { background: transparent; color: #a5b4fc; border: none; font-size: 12px; }
    .item { display:flex; justify-content:space-between; gap:10px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.05); }
    .item p { margin: 0; font-size: 13px; }
    .item small { color: #94a3b8; }
    .item button { border: none; background: transparent; color: #22c55e; }
    .empty { padding: 14px; color: #94a3b8; text-align:center; }
  `],
})
export class AdminNotificationBellComponent implements OnInit, OnDestroy {
  private svc = inject(AdminNotificationService);
  private sub = new Subscription();
  items: any[] = [];
  unreadCount = 0;
  open = false;

  ngOnInit(): void {
    this.sub.add(interval(15000).pipe(startWith(0)).subscribe(() => this.fetch()));
  }
  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
  fetch(): void {
    this.svc.list().subscribe((res) => {
      this.items = res.items || [];
      this.unreadCount = this.items.filter((x) => !x.read).length;
    });
  }
  markRead(id: string): void {
    this.svc.markRead(id).subscribe(() => this.fetch());
  }
  markAllRead(): void {
    this.svc.markAllRead().subscribe(() => this.fetch());
  }
}
