import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe, NgFor, NgIf } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import {
  TaxCalendarService,
  TaxCalendarItem,
  TaxCalendarSection,
  TaxType,
} from '@/app/core/services/tax-calendar.service';
import { AuthService } from '@/app/core/services/auth.service';
import { LayoutService } from '@/app/core/services/layout.service';
import { inject } from '@angular/core';
import { ToastService } from '@/app/core/services/toast.service';
import { SocketService } from '@/app/core/services/socket.service';
import { Subscription } from 'rxjs';

/** Use the same Budgets list component as Dashboard */


@Component({
  selector: 'app-tax-calendar',
  standalone: true,
  imports: [CommonModule, DatePipe, NgFor, NgIf, RouterModule],
  templateUrl: './tax-calendar.component.html',
  styleUrls: ['./tax-calendar.component.css'],
})
export class TaxCalendarComponent implements OnInit, OnDestroy {
  public layout = inject(LayoutService);
  private readonly socket = inject(SocketService);

  // inline budgets panel state
  showIncome = false;
  showExpense = false;
  showBudget = false;

  activeTab: 'upcoming' | 'history' = 'upcoming';

  constructor(
    private router: Router,
    private calendarSvc: TaxCalendarService,
    public auth: AuthService,
    private toasts: ToastService
  ) { }

  /* ===== Calendar data ===== */
  items: TaxCalendarItem[] = [];
  loading = true;
  error = '';
  bulkMsg = '';
  bulkBusy = false;

  private completingIds = new Set<string>();
  private deletingIds = new Set<string>();
  private subs = new Subscription();

  ngOnInit(): void {
    this.fetch();
    this.bindRealtime();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private fetch() {
    this.loading = true;
    this.error = '';
    this.calendarSvc.getItems().subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
      },
      error: (err) => {
        console.error('[tax-calendar] failed to fetch items', err);
        this.error = 'Failed to fetch calendar items from server.';
        this.items = [];
        this.loading = false;
      }
    });
  }

  /* ===== Budgets modal (same module as Dashboard) ===== */
  openBudget()  { this.showBudget = true;  this.showIncome = false; this.showExpense = false; }
  closeBudget() { this.showBudget = false; }
  openBudgetsOnDashboard() {
    this.router.navigate(['/dashboard'], { queryParams: { budgets: 'open' } });
  }

  /* ===== Calendar helpers ===== */
  get sections(): TaxCalendarSection[] {
    const filtered = this.items.filter(it => 
      this.activeTab === 'upcoming' 
        ? it.status === 'upcoming' 
        : (it.status === 'paid' || it.status === 'expired')
    );
    return this.calendarSvc.groupByMonth(filtered);
  }
  badgeClass(t: TaxType, status?: string) {
    return t === 'reminder' ? 'badge badge--reminder' : 'badge badge--payment';
  }
  statusBadgeClass(status?: string) {
    if (status === 'paid') return 'badge badge--success';
    if (status === 'expired') return 'badge badge--danger';
    return 'badge badge--primary';
  }
  isCompleting(id?: string) { return !!id && this.completingIds.has(id); }
  isDeleting(id?: string)   { return !!id && this.deletingIds.has(id); }

  onClose() { this.router.navigate(['/dashboard']); }
  goToEstimator() { this.router.navigate(['/tax-estimator']); }

  deleteAllReminders() {
    if (this.bulkBusy) return;
    if (!confirm('Delete ALL reminder events? This cannot be undone.')) return;

    this.bulkBusy = true;
    this.bulkMsg = 'Deleting reminder events...';

    this.calendarSvc.deleteAllReminders().subscribe({
      next: (count) => {
        this.items = this.items.filter(i => i.type !== 'reminder');
        this.bulkMsg = `Deleted ${count} reminder item${count === 1 ? '' : 's'}.`;
        this.bulkBusy = false;
        this.fetch();
      },
      error: (err) => {
        console.error('[tax-calendar] bulk delete failed', err);
        this.bulkMsg = 'Failed to delete reminders.';
        this.bulkBusy = false;
      }
    });
  }

  markComplete(item: TaxCalendarItem) {
    if (!item?._id) return;
    if (this.isCompleting(item._id)) return;
    if (!confirm('Mark this payment as completed? It will be removed.')) return;

    this.completingIds.add(item._id);
    this.calendarSvc.completePayment(item._id).subscribe({
      next: (ok) => {
        this.completingIds.delete(item._id!);
        if (ok) {
          item.status = 'paid';
          this.items = [...this.items]; // triggers digest
        } else {
          this.error = 'Failed to mark payment as complete.';
          setTimeout(() => (this.error = ''), 3000);
        }
      },
      error: (err) => {
        console.error('[tax-calendar] complete payment failed', err);
        this.completingIds.delete(item._id!);
        this.error = 'Failed to mark payment as complete.';
        setTimeout(() => (this.error = ''), 3000);
      }
    });
  }

  deleteReminder(item: TaxCalendarItem) {
    if (!item?._id) return;
    if (this.isDeleting(item._id)) return;
    if (!confirm('Delete this reminder?')) return;

    this.deletingIds.add(item._id);
    this.calendarSvc.deleteItem(item._id).subscribe({
      next: (ok) => {
        this.deletingIds.delete(item._id!);
        if (ok) this.items = this.items.filter(i => i._id !== item._id);
        else {
          this.error = 'Failed to delete reminder.';
          setTimeout(() => (this.error = ''), 3000);
        }
      },
      error: (err) => {
        console.error('[tax-calendar] delete reminder failed', err);
        this.deletingIds.delete(item._id!);
        this.error = 'Failed to delete reminder.';
        setTimeout(() => (this.error = ''), 3000);
      }
    });
  }

  private bindRealtime() {
    const socket = this.socket;

    this.subs.add(
      socket.on('reminderUpdated').subscribe((evt) => {
        if (evt.type === 'created' && evt.event) {
          const e = evt.event;
          const mapped: TaxCalendarItem = {
            _id: e._id,
            title: e.title,
            date: e.dueDate,
            note: e.description,
            type: (/reminder/i.test(e.title) ? 'reminder' : 'payment') as TaxType,
            status: e.status || 'upcoming',
          };
          this.items = [...this.items, mapped];
          this.toasts.success('Reminder added to calendar');
        } else if (evt.type === 'deleted' && evt.id) {
          this.items = this.items.filter(i => i._id !== evt.id);
          this.toasts.info('Reminder deleted');
        } else if (evt.type === 'bulkDeleted') {
          this.items = this.items.filter(i => i.type !== 'reminder');
          this.toasts.info('All reminders deleted');
        } else if (evt.type === 'updated' && evt.event) {
          const updated = evt.event;
          const index = this.items.findIndex(i => i._id === updated._id);
          if (index !== -1) {
            this.items[index].status = updated.status;
            this.items = [...this.items];
          }
        }
      })
    );

    this.subs.add(
      socket.on('paymentUpdated').subscribe((evt) => {
        // If calendar later visualizes payment statuses, hook here.
        // For now, no-op.
        void evt;
      })
    );
  }
}

