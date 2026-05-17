import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

export type IncomeBracket = 'low' | 'middle' | 'high';

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: 'USER' | 'CA' | 'ADMIN';
  status: 'active' | 'suspended';
  memberSince?: string | null;
  profilePhoto?: string;
  phone?: string;
  dob?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  country?: string;
  city?: string;
  address?: string;
  occupation?: string;
  workType?: 'freelancer' | 'salaried' | 'business' | 'other';
  panNumber?: string;
  aadhaarNumber?: string;
  taxRegime?: 'old' | 'new';
  incomeBracket?: 'under_5l' | '5l_10l' | '10l_25l' | '25l_50l' | '50l_plus';
  notificationPreferences?: {
    productUpdates: boolean;
    taxAlerts: boolean;
    reminders: boolean;
  };
  emailPreferences?: {
    statements: boolean;
    newsletters: boolean;
  };
  privacyPreferences?: {
    profileVisibility: 'private' | 'team';
    analyticsConsent: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private base = '/api/v1/users';
  private legacyBase = '/api/v1/auth';

  private normalizeProfile(raw: any): Profile {
    const source = raw?.data ?? raw?.user ?? raw ?? {};
    return {
      id: String(source.id ?? source._id ?? ''),
      fullName: source.fullName ?? source.name ?? '',
      email: source.email ?? '',
      role: source.role ?? 'USER',
      status: source.status ?? 'active',
      memberSince: source.memberSince ?? source.createdAt ?? null,
      profilePhoto: source.profilePhoto ?? '',
      phone: source.phone ?? '',
      dob: source.dob ?? null,
      gender: source.gender ?? 'prefer_not_to_say',
      country: source.country ?? '',
      city: source.city ?? '',
      address: source.address ?? '',
      occupation: source.occupation ?? '',
      workType: source.workType ?? 'other',
      panNumber: source.panNumber ?? '',
      aadhaarNumber: source.aadhaarNumber ?? '',
      taxRegime: source.taxRegime ?? 'new',
      incomeBracket: source.incomeBracket ?? source.income_bracket ?? 'under_5l',
      notificationPreferences: {
        productUpdates: Boolean(source.notificationPreferences?.productUpdates ?? true),
        taxAlerts: Boolean(source.notificationPreferences?.taxAlerts ?? true),
        reminders: Boolean(source.notificationPreferences?.reminders ?? true),
      },
      emailPreferences: {
        statements: Boolean(source.emailPreferences?.statements ?? true),
        newsletters: Boolean(source.emailPreferences?.newsletters ?? false),
      },
      privacyPreferences: {
        profileVisibility: source.privacyPreferences?.profileVisibility ?? 'private',
        analyticsConsent: Boolean(source.privacyPreferences?.analyticsConsent ?? true),
      },
    };
  }

  getMe(): Observable<Profile> {
    return this.http.get<any>(`${this.base}/me`).pipe(
      map((r) => this.normalizeProfile(r)),
      catchError(() =>
        this.http.get<any>(`${this.legacyBase}/me`).pipe(
          map((r) => this.normalizeProfile(r)),
          catchError((err) => throwError(() => err))
        )
      )
    );
  }

  updateMe(input: Partial<Profile>): Observable<Profile> {
    return this.http.put<any>(`${this.base}/me`, input).pipe(
      map((r) => this.normalizeProfile(r)),
      catchError(() =>
        this.http.put<any>(`${this.legacyBase}/me`, {
          name: input.fullName ?? '',
          email: input.email ?? '',
          country: input.country ?? '',
          income_bracket: 'middle',
        }).pipe(
          map((r) => this.normalizeProfile(r)),
          catchError((err) => throwError(() => err))
        )
      )
    );
  }

  uploadProfilePhoto(file: File): Observable<Profile> {
    const fd = new FormData();
    fd.append('photo', file);
    return this.http.patch<any>(`${this.base}/profile-photo`, fd).pipe(
      map((r) => this.normalizeProfile(r))
    );
  }

  updatePassword(currentPassword: string, newPassword: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(`${this.base}/password`, {
      currentPassword,
      newPassword,
    });
  }
}
