import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminItrService } from '../../../../core/services/admin-itr.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ItrRecord } from '../../../../core/services/itr-api.service';
import { ItrStatus } from '../../../../core/types/itr-status';

@Component({
  selector: 'app-admin-itr-registry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="view-header">
      <div class="h-main">
        <h2>ITR Registry</h2>
        <p>Monitor and manage all tax return filings</p>
      </div>
      <div class="h-actions">
        <select [(ngModel)]="statusFilter" class="filter-select">
          <option value="ALL">All Status</option>
          <option value="submitted">Submitted</option>
          <option value="assigned">Assigned</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="payment_pending">Payment Pending</option>
          <option value="payment_completed">Paid (Ready to File)</option>
          <option value="filed">Filed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
    </div>

    <div class="itr-grid" *ngIf="itrs.length > 0; else emptyState">
      <div class="itr-card" *ngFor="let it of filteredItrs">
        <div class="card-head">
          <div class="u-info">
            <span class="user-name">{{ it.personalInfo.firstName }} {{ it.personalInfo.lastName }}</span>
            <span class="ay-badge">AY {{ it.assessmentYear }}</span>
          </div>
          <span class="status-pill" [class]="it.status.toLowerCase()">{{ it.status.replace('_', ' ') }}</span>
        </div>
        
        <div class="card-body">
          <div class="detail-row">
            <span class="lb">Income:</span>
            <span class="vl">₹{{ it.income.totalIncome.toLocaleString() }}</span>
          </div>
          <div class="detail-row">
            <span class="lb">Tax Due:</span>
            <span class="vl">₹{{ it.taxSummary.finalTax.toLocaleString() }}</span>
          </div>
          <div class="detail-row">
            <span class="lb">Assigned CA:</span>
            <span class="vl">{{ caName(it) }}</span>
          </div>
          <div class="detail-row">
            <span class="lb">Payment:</span>
            <span class="vl">{{ (it.paymentStatus || it.payment?.paymentStatus || 'not_required').replace('_', ' ') }}</span>
          </div>
          <div class="detail-row">
            <span class="lb">Txn ID:</span>
            <span class="vl">{{ it.paymentId || it.payment?.paymentId || 'N/A' }}</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-outline" (click)="viewDetails(it)">View Details</button>
          <button class="btn-primary" (click)="openAssignment(it)">Assign CA</button>
          <button class="btn-outline" (click)="updateStatus(it, 'under_review')">Review</button>
          <button class="btn-success" (click)="updateStatus(it, 'approved')">Approve</button>
          <button class="btn-outline" (click)="updateStatus(it, 'rejected')">Reject</button>
          <button class="btn-success" *ngIf="it.status === 'payment_completed'" (click)="updateStatus(it, 'filed')">Mark Filed</button>
          <button class="btn-outline" *ngIf="it.documents?.length" (click)="downloadDocs(it)">Download Docs</button>
        </div>
      </div>
    </div>

    <ng-template #emptyState>
      <div class="empty-area">
        <div class="empty-icon">📂</div>
        <h3>No ITR Filings Yet</h3>
        <p>Once users start filing, they will appear here.</p>
      </div>
    </ng-template>

    <!-- ASSIGN MODAL (Simple Overlay) -->
    <div class="modal-overlay" *ngIf="selectedItr" (click)="closeAssignment()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <h3>Assign Professional CA</h3>
        <p>Select a qualified CA to review this filing.</p>
        
        <select [(ngModel)]="selectedCaId" class="ca-select">
          <option value="">Choose CA...</option>
          <option *ngFor="let c of cas" [value]="c.id">{{ c.name }} ({{ c.email }})</option>
        </select>

        <div class="modal-foot">
          <button class="btn-outline" (click)="closeAssignment()">Cancel</button>
          <button class="btn-success" (click)="confirmAssignment()">Confirm Assignment</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .view-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; }
    .h-main h2 { font-size: 1.75rem; font-weight: 800; margin: 0; }
    .h-main p { color: #64748b; margin: 0.25rem 0 0 0; }
    .filter-select { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1rem; border-radius: 12px; color: #fff; }

    .itr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }
    .itr-card { background: #1e293b; border-radius: 24px; padding: 1.5rem; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s; }
    .itr-card:hover { transform: translateY(-4px); border-color: rgba(99, 102, 241, 0.3); }
    
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    .user-name { display: block; font-weight: 800; font-size: 1.1rem; }
    .ay-badge { display: inline-block; font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 6px; color: #94a3b8; font-weight: 600; margin-top: 4px; }
    
    .status-pill { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; border: 1px solid transparent; }
    .status-pill.filed { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); }
    .status-pill.payment_pending { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-color: rgba(245, 158, 11, 0.2); }
    .status-pill.payment_completed { background: rgba(99, 102, 241, 0.1); color: #6366f1; border-color: rgba(99, 102, 241, 0.2); }
    .status-pill.under_review { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-color: rgba(139, 92, 246, 0.2); }
    .status-pill.submitted { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: rgba(255, 255, 255, 0.2); }
    .status-pill.assigned { background: rgba(30, 215, 96, 0.1); color: #1ed760; border-color: rgba(30, 215, 96, 0.2); }
    .status-pill.approved { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); }
    .status-pill.rejected { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }

    .card-body { padding: 1rem 0; border-top: 1px solid rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.03); margin-bottom: 1.25rem; }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; }
    .lb { color: #64748b; }
    .vl { font-weight: 600; color: #f1f5f9; }

    .card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .card-actions .btn-success { grid-column: span 2; }

    .btn-primary { background: #6366f1; color: #fff; border: none; padding: 0.75rem; border-radius: 12px; font-weight: 700; cursor: pointer; }
    .btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem; border-radius: 12px; font-weight: 700; cursor: pointer; }
    .btn-success { background: #10b981; color: #fff; border: none; padding: 0.6rem; border-radius: 12px; font-weight: 700; cursor: pointer; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 2000; }
    .modal-card { background: #1e293b; border-radius: 24px; padding: 2.5rem; width: 100%; max-width: 440px; }
    .ca-select { width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); padding: 1rem; border-radius: 16px; color: #fff; margin: 1.5rem 0; font-size: 1rem; }
    .modal-foot { display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; }

    .empty-area { text-align: center; padding: 6rem 2rem; background: #1e293b; border-radius: 30px; border: 2px dashed rgba(255,255,255,0.05); }
    .empty-icon { font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3; }
    .empty-area h3 { margin: 0; font-size: 1.5rem; color: #94a3b8; }
    .empty-area p { color: #64748b; }
  `]
})
export class AdminItrRegistryComponent implements OnInit {
  itrs: ItrRecord[] = [];
  statusFilter: ItrStatus | 'ALL' = 'ALL';
  cas: any[] = [];
  
  selectedItr: ItrRecord | null = null;
  selectedCaId = '';

  constructor(private adminApi: AdminItrService, private toast: ToastService) {}

  ngOnInit(): void {
    this.refresh();
    this.adminApi.listCas().subscribe(res => this.cas = res.items);
  }

  refresh() {
    this.adminApi.list().subscribe(res => {
      this.itrs = res.items;
    });
  }

  get filteredItrs() {
    return this.itrs.filter(it => this.statusFilter === 'ALL' || it.status === this.statusFilter);
  }

  updateStatus(it: ItrRecord, status: ItrStatus) {
    this.adminApi.updateStatus(it._id, status).subscribe({
      next: () => this.refresh(),
      error: (err) => this.toast.error(err.error?.message || 'Update failed')
    });
  }

  caName(it: any): string {
    return it.assignedCa?.name || it.assignedCaId?.name || 'Not Assigned';
  }

  openAssignment(it: ItrRecord) {
    this.selectedItr = it;
    this.selectedCaId = '';
  }

  closeAssignment() {
    this.selectedItr = null;
  }

  confirmAssignment() {
    if (!this.selectedItr || !this.selectedCaId) return;
    this.adminApi.assignCa(this.selectedItr._id, this.selectedCaId).subscribe({
      next: () => {
        this.closeAssignment();
        this.refresh();
      },
      error: (e) => {
        console.error('[Admin Assign CA] UI Error:', e);
        this.toast.error(e.error?.message || 'Failed to assign CA.');
      }
    });
  }

  downloadDocs(it: any): void {
    const doc = Array.isArray(it?.documents) ? it.documents[0] : null;
    const url = doc?.fileUrl;
    if (url) {
      window.open(url, '_blank');
    }
  }

  viewDetails(it: any): void {
    const userName = `${it?.personalInfo?.firstName || ''} ${it?.personalInfo?.lastName || ''}`.trim() || 'Taxpayer';
    const summary = `Taxpayer: ${userName}\nAY: ${it?.assessmentYear || '-'}\nStatus: ${it?.status || '-'}\nTax Payable: ${it?.taxSummary?.finalTax || 0}`;
    alert(summary);
  }
}
