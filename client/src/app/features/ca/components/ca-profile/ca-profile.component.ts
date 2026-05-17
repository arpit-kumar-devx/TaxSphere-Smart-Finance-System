import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CaProfileService } from '../../../../core/services/ca-profile.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-ca-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="card">
      <h2>Professional Profile</h2>
      <div class="grid">
        <input [(ngModel)]="form.fullName" placeholder="Full name">
        <input [(ngModel)]="form.email" placeholder="Email">
        <input [(ngModel)]="form.phone" placeholder="Phone">
        <input [(ngModel)]="form.qualification" placeholder="Qualification">
        <input [(ngModel)]="form.membershipNumber" placeholder="Membership number">
        <input [(ngModel)]="form.specialization" placeholder="Specialization">
        <input [(ngModel)]="form.yearsOfExperience" type="number" placeholder="Years of experience">
        <input [(ngModel)]="form.officeAddress" placeholder="Office address">
        <input [(ngModel)]="form.serviceFee" type="number" placeholder="Service fee">
        <input [(ngModel)]="form.supportedTaxYears" placeholder="Supported tax years">
      </div>
      <textarea [(ngModel)]="form.professionalBio" rows="4" placeholder="Professional bio"></textarea>
      <div class="row"><button (click)="save()">Save Profile</button><span>{{ completion }}% complete</span></div>
    </section>
  `,
  styles: [`.card{background:#1e293b;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}input,textarea{background:#0f172a;border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:10px;padding:10px;width:100%;box-sizing:border-box;margin-top:8px}.row{display:flex;justify-content:space-between;align-items:center;margin-top:12px}button{background:#2563eb;border:none;color:#fff;border-radius:8px;padding:9px 12px}`],
})
export class CaProfileComponent implements OnInit {
  form: any = {};
  constructor(private profile: CaProfileService, private toast: ToastService) {}
  ngOnInit(): void {
    this.profile.getProfile().subscribe((p) => this.form = p || {});
  }
  get completion(): number {
    const fields = ['fullName', 'email', 'phone', 'qualification', 'membershipNumber', 'specialization', 'yearsOfExperience', 'officeAddress', 'professionalBio'];
    const done = fields.filter((k) => !!this.form?.[k]).length;
    return Math.round((done / fields.length) * 100);
  }
  save(): void {
    this.profile.updateProfile(this.form).subscribe(() => this.toast.success('CA profile saved'));
  }
}
