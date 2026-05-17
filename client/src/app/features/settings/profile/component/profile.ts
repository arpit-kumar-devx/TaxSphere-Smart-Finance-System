import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Profile, ProfileService } from '@/app/core/services/profile.service';
import { LayoutService } from '@/app/core/services/layout.service';
import { ToastService } from '@/app/core/services/toast.service';
import { AuthService } from '@/app/core/services/auth.service';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
  encapsulation: ViewEncapsulation.None
})
export class SettingsProfileComponent implements OnInit {
  private api = inject(ProfileService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  public layout = inject(LayoutService);

  loading = true;
  initialLoadCompleted = false;
  saving = false;
  uploadingPhoto = false;
  changingPassword = false;
  error = '';
  selectedPhotoFile: File | null = null;
  photoPreviewUrl = '';
  profile: Profile | null = null;

  readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.pattern(/^[0-9+\-\s]{8,15}$/)]],
    dob: [''],
    gender: ['prefer_not_to_say' as const],
    country: [''],
    city: [''],
    address: [''],
    occupation: [''],
    workType: ['other' as const],
    panNumber: ['', [Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)]],
    aadhaarNumber: ['', [Validators.pattern(/^[0-9]{12}$/)]],
    taxRegime: ['new' as const],
    incomeBracket: ['under_5l' as const],
    productUpdates: [true],
    taxAlerts: [true],
    reminders: [true],
    emailStatements: [true],
    emailNewsletters: [false],
    profileVisibility: ['private' as const],
    analyticsConsent: [true],
  });

  readonly passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    this.error = '';
    this.api.getMe().subscribe({
      next: (u) => {
        this.profile = u;
        this.photoPreviewUrl = this.resolvePhoto(u.profilePhoto);
        this.patchForm(u);
        this.loading = false;
        this.initialLoadCompleted = true;
      },
      error: (e) => {
        this.error = e?.error?.message || 'Failed to load profile';
        this.loading = false;
        this.initialLoadCompleted = true;
        this.toast.error(this.error);
      }
    });
  }

  private patchForm(u: Profile): void {
    this.form.patchValue({
      fullName: u.fullName || '',
      email: u.email || '',
      phone: u.phone || '',
      dob: u.dob ? String(u.dob).slice(0, 10) : '',
      gender: (u.gender || 'prefer_not_to_say') as any,
      country: u.country || '',
      city: u.city || '',
      address: u.address || '',
      occupation: u.occupation || '',
      workType: (u.workType || 'other') as any,
      panNumber: u.panNumber || '',
      aadhaarNumber: u.aadhaarNumber || '',
      taxRegime: (u.taxRegime || 'new') as any,
      incomeBracket: (u.incomeBracket || 'under_5l') as any,
      productUpdates: Boolean(u.notificationPreferences?.productUpdates ?? true),
      taxAlerts: Boolean(u.notificationPreferences?.taxAlerts ?? true),
      reminders: Boolean(u.notificationPreferences?.reminders ?? true),
      emailStatements: Boolean(u.emailPreferences?.statements ?? true),
      emailNewsletters: Boolean(u.emailPreferences?.newsletters ?? false),
      profileVisibility: (u.privacyPreferences?.profileVisibility || 'private') as any,
      analyticsConsent: Boolean(u.privacyPreferences?.analyticsConsent ?? true),
    }, { emitEvent: false });
    this.form.markAsPristine();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.error = '';
    const v = this.form.value;
    const payload: Partial<Profile> = {
      fullName: String(v.fullName || ''),
      email: String(v.email || ''),
      phone: String(v.phone || ''),
      dob: v.dob || null,
      gender: v.gender as any,
      country: String(v.country || ''),
      city: String(v.city || ''),
      address: String(v.address || ''),
      occupation: String(v.occupation || ''),
      workType: v.workType as any,
      panNumber: String(v.panNumber || '').toUpperCase(),
      aadhaarNumber: String(v.aadhaarNumber || ''),
      taxRegime: v.taxRegime as any,
      incomeBracket: v.incomeBracket as any,
      notificationPreferences: {
        productUpdates: Boolean(v.productUpdates),
        taxAlerts: Boolean(v.taxAlerts),
        reminders: Boolean(v.reminders),
      },
      emailPreferences: {
        statements: Boolean(v.emailStatements),
        newsletters: Boolean(v.emailNewsletters),
      },
      privacyPreferences: {
        profileVisibility: v.profileVisibility as any,
        analyticsConsent: Boolean(v.analyticsConsent),
      },
    };
    this.api.updateMe(payload).subscribe({
      next: (u) => {
        this.profile = u;
        this.patchForm(u);
        this.syncSidebarUser();
        this.saving = false;
        this.toast.success('Profile updated successfully');
      },
      error: (e) => {
        this.error = e?.error?.message || 'Failed to save profile';
        this.saving = false;
        this.toast.error(this.error);
      }
    });
  }

  onPhotoSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      this.toast.error('Please upload JPG or PNG image only.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.toast.error('Profile photo size must be under 2 MB.');
      return;
    }
    this.selectedPhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreviewUrl = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  uploadPhoto(): void {
    if (!this.selectedPhotoFile) return;
    this.uploadingPhoto = true;
    this.api.uploadProfilePhoto(this.selectedPhotoFile).subscribe({
      next: (u) => {
        this.profile = u;
        this.photoPreviewUrl = this.resolvePhoto(u.profilePhoto);
        this.selectedPhotoFile = null;
        this.uploadingPhoto = false;
        this.syncSidebarUser();
        this.toast.success('Profile photo updated');
      },
      error: (e) => {
        this.error = e?.error?.message || 'Failed to save profile';
        this.uploadingPhoto = false;
        this.toast.error(this.error);
      }
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const currentPassword = String(this.passwordForm.value.currentPassword || '');
    const newPassword = String(this.passwordForm.value.newPassword || '');
    this.changingPassword = true;
    this.api.updatePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.changingPassword = false;
        this.passwordForm.reset();
        this.toast.success('Password updated');
      },
      error: (e) => {
        this.changingPassword = false;
        this.toast.error(e?.error?.message || 'Failed to update password');
      }
    });
  }

  get completionPercent(): number {
    const fields = [
      this.form.value.fullName,
      this.form.value.email,
      this.form.value.phone,
      this.form.value.country,
      this.form.value.city,
      this.form.value.address,
      this.form.value.occupation,
      this.form.value.panNumber,
      this.form.value.aadhaarNumber,
      this.profile?.profilePhoto,
    ];
    const done = fields.filter((f) => String(f || '').trim().length > 0).length;
    return Math.round((done / fields.length) * 100);
  }

  get missingFields(): string[] {
    const map: Array<{ label: string; value: unknown }> = [
      { label: 'Full Name', value: this.form.value.fullName },
      { label: 'Phone', value: this.form.value.phone },
      { label: 'Country', value: this.form.value.country },
      { label: 'City', value: this.form.value.city },
      { label: 'Address', value: this.form.value.address },
      { label: 'Occupation', value: this.form.value.occupation },
      { label: 'PAN', value: this.form.value.panNumber },
      { label: 'Aadhaar', value: this.form.value.aadhaarNumber },
      { label: 'Profile Photo', value: this.profile?.profilePhoto },
    ];
    return map.filter((x) => !String(x.value || '').trim()).map((x) => x.label);
  }

  get hasOptionalProfileData(): boolean {
    return [
      this.form.value.phone,
      this.form.value.dob,
      this.form.value.city,
      this.form.value.address,
      this.form.value.occupation,
      this.form.value.panNumber,
      this.form.value.aadhaarNumber,
    ].some((v) => String(v || '').trim().length > 0);
  }

  get maskedPan(): string {
    const pan = String(this.form.value.panNumber || '');
    if (pan.length < 10) return pan || 'Not provided';
    return `${pan.slice(0, 3)}****${pan.slice(-3)}`;
  }

  get maskedAadhaar(): string {
    const aadhaar = String(this.form.value.aadhaarNumber || '');
    if (aadhaar.length < 12) return aadhaar || 'Not provided';
    return `XXXX XXXX ${aadhaar.slice(-4)}`;
  }

  resolvePhoto(photoPath?: string): string {
    if (!photoPath) return '';
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://') || photoPath.startsWith('/')) {
      return photoPath;
    }
    return `/${photoPath.replace(/^\/+/, '')}`;
  }

  private syncSidebarUser(): void {
    if (!this.profile) return;
    this.auth.updateCurrentUser({
      name: this.profile.fullName,
      email: this.profile.email,
      profilePhoto: this.profile.profilePhoto,
      role: this.profile.role,
      status: this.profile.status,
      country: this.profile.country,
      city: this.profile.city,
    });
  }
}
