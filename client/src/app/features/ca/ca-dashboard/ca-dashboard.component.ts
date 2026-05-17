import { Component, OnDestroy, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CaApiService, CaAnalyticsOverview } from '../../../core/services/ca-api.service';
import { ItrRecord } from '../../../core/services/itr-api.service';
import { ItrStatus } from '../../../core/types/itr-status';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';

@Component({
  selector: 'app-ca-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, KanbanBoardComponent],
  templateUrl: './ca-dashboard.component.html',
  styleUrls: ['./ca-dashboard.component.css'],
})
export class CaDashboardComponent implements OnInit, OnDestroy {
  items: ItrRecord[] = [];
  selected: ItrRecord | null = null;
  loading = true;
  err = '';
  busy = false;
  remarks = '';
  nextStatus: ItrStatus = 'under_review';
  
  // Advanced Features
  viewMode: 'list' | 'kanban' = 'list';
  currentTab: 'workspace' | 'profile' = 'workspace';
  auditLogs: any[] = [];
  currentTime = new Date();
  
  // Professional Profile
  caProfile: any = { qualification: '', experience: 0, specialization: '', bio: '' };
  savingProfile = false;
  analytics: CaAnalyticsOverview | null = null;
  summary: any = null;
  private refreshTimer: any = null;
  private clockTimer: any = null;

  constructor(
    private caApi: CaApiService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadDashboard();
      this.loadProfile();
      this.clockTimer = setInterval(() => (this.currentTime = new Date()), 60000);
      // Keep CA dashboard in near real-time for payment/commission updates.
      this.refreshTimer = setInterval(() => this.loadDashboard(true), 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  loadDashboard(isBackgroundRefresh = false): void {
    this.reload(!isBackgroundRefresh);
  }

  loadAnalytics(): void {
    this.caApi.getAnalyticsOverview().subscribe({
      next: (res) => (this.analytics = res?.data || null),
      error: () => (this.analytics = null),
    });
  }

  loadProfile(): void {
     this.caApi.getProfile().subscribe(p => this.caProfile = p);
  }

  saveProfile(): void {
     this.savingProfile = true;
     this.caApi.updateProfile(this.caProfile).subscribe({
        next: () => {
           this.savingProfile = false;
        },
        error: () => this.savingProfile = false
     });
  }

  // --- Performance Metrics (Enterprise) ---
  get pendingCount(): number {
    if (this.summary) return this.summary.pendingReview || 0;
    if (this.analytics) return this.analytics.pendingReviews;
    return this.items.filter(i => i.status === 'assigned' || i.status === 'under_review').length;
  }

  get completedCount(): number {
    if (this.summary) return (this.summary.approved || 0) + (this.summary.filed || 0);
    if (this.analytics) return this.analytics.approved + this.analytics.filed;
    return this.items.filter(i => ['approved', 'payment_pending', 'payment_completed', 'filed'].includes(i.status)).length;
  }

  get averageProcessingTime(): string {
     return "2.4 Days"; // Mocked enterprise metric
  }

  get earningsThisMonth(): number {
    if (this.summary && Number.isFinite(Number(this.summary.commissionEarned))) {
      return Number(this.summary.commissionEarned || 0);
    }
    if (this.analytics) return this.analytics.commissionEarnings;
    return 0;
  }

  get docsPendingCount(): number {
    if (this.summary) return this.summary.docsPending || 0;
    return this.items.reduce((acc, it) => acc + (it.documents || []).filter((d: any) => (d.status || 'pending') === 'pending').length, 0);
  }

  get rejectedCount(): number {
    if (this.summary) return this.summary.rejected || 0;
    return this.items.filter((x) => x.status === 'rejected').length;
  }

  get paymentsPendingCount(): number {
    return this.items.filter((x: any) => ['pending', 'created', 'failed'].includes(String(x.paymentStatus || x.payment?.paymentStatus || ''))).length;
  }

  get paymentsCompletedCount(): number {
    if (this.summary && Number.isFinite(Number(this.summary.paymentsCompleted))) {
      return Number(this.summary.paymentsCompleted || 0);
    }
    return this.items.filter((x: any) => String(x.paymentStatus || x.payment?.paymentStatus || '') === 'paid').length;
  }

  reload(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.caApi.getAssignedITRs().subscribe({
      next: (r: { data: ItrRecord[] }) => {
        this.items = r.data;
        this.summary = (r as any).summary || (this.summary || null);
        if ((r as any).commissionEarned !== undefined) {
          this.summary = {
            ...(this.summary || {}),
            commissionEarned: Number((r as any).commissionEarned || 0),
            paymentsCompleted: Number((r as any).paymentsCompleted || 0),
          };
        }
        this.loading = false;
        this.loadAnalytics();
      },
      error: (e: HttpErrorResponse) => {
        this.err = e.error?.message || 'Failed to load assigned cases';
        if (showLoader) this.loading = false;
      },
    });
  }

  open(it: ItrRecord): void {
    this.selected = it;
    this.caApi.getItr(it._id).subscribe({
      next: d => {
        this.selected = d;
        // Auto-select next logical status
        if (d.status === 'assigned') this.nextStatus = 'under_review';
        else if (d.status === 'under_review') this.nextStatus = 'approved';
        else if (d.status === 'payment_completed') this.nextStatus = 'filed';
        else this.nextStatus = d.status;
      },
      error: e => (this.err = e.error?.message || 'Could not load record details'),
    });
  }

  closeDetail(): void {
    this.selected = null;
    this.remarks = '';
  }

  onKanbanMove(event: { id: string, status: string }) {
     this.nextStatus = event.status as ItrStatus;
     const it = this.items.find(i => i._id === event.id);
     if (it) {
        this.selected = it;
        this.setItrStatus();
     }
  }

  reviewDoc(docId: string, status: 'verified' | 'rejected'): void {
    if (!this.selected) return;
    this.busy = true;
    this.caApi.reviewDoc(this.selected._id, docId, { status, remarks: this.remarks }).subscribe({
      next: d => {
        this.selected = d;
        this.busy = false;
        this.remarks = '';
        this.loadDashboard();
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Document review failed.';
      },
    });
  }

  setItrStatus(): void {
    if (!this.selected) return;
    this.busy = true;
    this.caApi.setStatus(this.selected._id, { status: this.nextStatus, caRemarks: this.remarks }).subscribe({
      next: d => {
        this.selected = (d as any).data || (d as any).itr || d;
        this.busy = false;
        this.remarks = '';
        this.loadDashboard();
      },
      error: e => {
        this.busy = false;
        this.err = e.error?.message || 'Status update failed';
      },
    });
  }

  taxpayerName(it: any): string {
    if (it.userId && typeof it.userId === 'object' && it.userId.name) return it.userId.name;
    return it.personalInfo?.firstName ? `${it.personalInfo.firstName} ${it.personalInfo.lastName || ''}` : 'Unknown Client';
  }

  getPaymentStatus(it: any): string {
    return String(it?.paymentStatus || it?.payment?.paymentStatus || 'not_required');
  }

  getPaidAt(it: any): string | null {
    return it?.paidAt || it?.payment?.paidAt || null;
  }
}
