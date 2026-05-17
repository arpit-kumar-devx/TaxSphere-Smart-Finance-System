import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSettingsService } from '../../../../core/services/admin-settings.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="view-header">
      <div class="h-main">
        <h2>System Settings</h2>
        <p>Global configurations for the TaxSphere ecosystem</p>
      </div>
    </div>

    <div class="settings-shell shadow-premium">
      <div class="settings-section">
        <h3>General Configuration</h3>
        <div class="field-grid">
          <div class="field">
            <label>Application Name</label>
            <input type="text" [(ngModel)]="settings.appName" placeholder="TaxSphere Enterprise">
          </div>
          <div class="field">
            <label>Current Tax Year</label>
            <input type="text" [(ngModel)]="settings.taxYear" placeholder="2024-25">
          </div>
          <div class="field full">
            <label>Logo URL (External Link)</label>
            <input type="text" [(ngModel)]="settings.logoUrl" placeholder="https://example.com/logo.png">
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Gateway & Infrastructure</h3>
        <div class="toggle-list">
          <div class="toggle-item">
            <div class="t-info">
              <span class="t-title">Maintenance Mode</span>
              <span class="t-desc">Restrict user access while performing updates</span>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="settings.maintenanceMode">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-item">
            <div class="t-info">
              <span class="t-title">System Notifications</span>
              <span class="t-desc">Enable/Disable automated email and push alerts</span>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="settings.notificationEnabled">
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Payment Environment</h3>
        <div class="radio-group">
          <label class="radio-opt" [class.active]="settings.paymentMode === 'test'">
            <input type="radio" name="payMode" value="test" [(ngModel)]="settings.paymentMode">
            <div class="r-text">
              <span class="r-title">Test Mode (Recommended for Dev)</span>
              <span class="r-desc">Simulator enabled. No real money will be charged.</span>
            </div>
          </label>
          <label class="radio-opt" [class.active]="settings.paymentMode === 'live'">
            <input type="radio" name="payMode" value="live" [(ngModel)]="settings.paymentMode">
            <div class="r-text">
              <span class="r-title">Production Mode (Live)</span>
              <span class="r-desc">Real transactions via Razorpay production gateway.</span>
            </div>
          </label>
        </div>
      </div>

      <div class="settings-foot">
        <button class="btn-primary btn-ghost" (click)="reset()">Reset</button>
        <button class="btn-primary" (click)="save()">Save Changes</button>
      </div>
    </div>
  `,
  styles: [`
    .view-header { margin-bottom: 2rem; }
    .h-main h2 { font-size: 1.75rem; font-weight: 800; margin: 0; }
    .h-main p { color: #64748b; margin: 0.25rem 0 0 0; }

    .settings-shell { background: #1e293b; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
    .settings-section { padding: 2rem; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .settings-section h3 { font-size: 1rem; margin: 0 0 1.5rem 0; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .field label { display: block; font-size: 0.8rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.5rem; }
    .field input { width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); padding: 0.85rem 1rem; border-radius: 12px; color: #fff; font-size: 0.9rem; outline: none; }
    .field input:focus { border-color: #6366f1; }
    .field.full { grid-column: span 2; }

    .toggle-list { display: flex; flex-direction: column; gap: 1.5rem; }
    .toggle-item { display: flex; justify-content: space-between; align-items: center; }
    .t-info { display: flex; flex-direction: column; gap: 2px; }
    .t-title { font-weight: 700; color: #f1f5f9; }
    .t-desc { font-size: 0.75rem; color: #64748b; }

    .radio-group { display: flex; flex-direction: column; gap: 1rem; }
    .radio-opt { display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; cursor: pointer; transition: 0.2s; }
    .radio-opt:hover { background: rgba(255,255,255,0.02); }
    .radio-opt.active { background: rgba(99, 102, 241, 0.05); border-color: #6366f1; }
    .radio-opt input { margin-top: 4px; }
    .r-title { display: block; font-weight: 700; color: #f1f5f9; margin-bottom: 2px; }
    .r-desc { display: block; font-size: 0.75rem; color: #64748b; }

    .settings-foot { padding: 2rem; background: rgba(0,0,0,0.1); text-align: right; }
    .btn-primary { background: #6366f1; color: #fff; border: none; padding: 0.9rem 2.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; }
    .btn-primary:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
    .btn-ghost { margin-right: 10px; background: transparent; border: 1px solid rgba(255,255,255,.18); }

    /* Switch CSS */
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background-color: #334155; transition: .4s; border-radius: 24px; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: #10b981; }
    input:checked + .slider:before { transform: translateX(20px); }
  `]
})
export class AdminSettingsComponent implements OnInit {
  settings: any = {
    appName: 'TaxSphere',
    logoUrl: '',
    maintenanceMode: false,
    notificationEnabled: true,
    paymentMode: 'test',
    taxYear: '2024-25'
  };

  constructor(private adminApi: AdminSettingsService, private toast: ToastService) {}

  ngOnInit(): void {
    this.adminApi.get().subscribe(s => this.settings = s);
  }

  save() {
    if (!this.settings.appName || !this.settings.taxYear) {
      this.toast.error('App name and tax year are required');
      return;
    }
    this.adminApi.update(this.settings).subscribe(() => {
       this.toast.success('System settings updated');
    });
  }

  reset() {
    this.ngOnInit();
    this.toast.info('Settings reset to saved values');
  }
}
