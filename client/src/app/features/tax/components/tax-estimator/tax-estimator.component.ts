import { Component, OnInit, Output, EventEmitter, Optional, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  TaxEstimatorService,
  EstimatorInput,
  TaxSummary,
} from '@/app/core/services/tax-estimator.service';
import { TaxCalendarService } from '@/app/core/services/tax-calendar.service';
import { LayoutService } from '@/app/core/services/layout.service';
import { AuthService } from '@/app/core/services/auth.service';

import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

type Q = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type SnackKind = 'success' | 'error' | 'info';
type Snack = { id: string; text: string; kind: SnackKind };

@Component({
  selector: 'app-tax-estimator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './tax-estimator.component.html',
  styleUrls: ['./tax-estimator.component.css'],
})
export class TaxEstimatorComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  public layout = inject(LayoutService);
  public auth = inject(AuthService, { optional: true });

  showBudget = false;
  activeTab: 'form' | 'summary' = 'form';
  form: FormGroup;

  countries: string[] = [];
  statesByCountry: Record<string, string[]> = {};
  filingStatuses: string[] = [];
  quarters: { id: Q; label: string }[] = [];

  summary: TaxSummary = { gross: 0, deductions: 0, taxable: 0, estimatedTax: 0 };
  status: 'idle' | 'calculating' | 'success' | 'error' = 'idle';
  snacks: Snack[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private taxSvc: TaxEstimatorService,
    private calendarSvc: TaxCalendarService
  ) {
    this.form = this.fb.group({
      country: ['India', Validators.required],
      state: ['Maharashtra', Validators.required],
      status: ['Individual', Validators.required],
      quarter: ['Q1', Validators.required],
      grossIncome: [0, [Validators.min(0)]],
      businessExpenses: [0, [Validators.min(0)]],
      retirement: [0, [Validators.min(0)]],
      health: [0, [Validators.min(0)]],
      homeOffice: [0, [Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    this.countries = this.taxSvc.getCountries();
    this.statesByCountry = this.taxSvc.getStatesByCountry();
    this.filingStatuses = this.taxSvc.getFilingStatuses();
    this.quarters = this.taxSvc.getQuarters(2025) as any;

    this.form.get('country')!.valueChanges.subscribe((c: string) => {
      const states = this.statesByCountry[c] || [];
      const current = this.form.get('state')!.value;
      if (!states.includes(current)) this.form.get('state')!.setValue(states[0] ?? '');
    });

    this.form.valueChanges.subscribe(() => {
      this.summary = this.computeLocalSummary();
    });

    this.summary = this.computeLocalSummary();
  }

  openBudget()  { this.showBudget = true; }
  closeBudget() { this.showBudget = false; }

  switchTab(tab: 'form' | 'summary') {
    this.activeTab = tab;
    if (tab === 'summary') this.summary = this.computeLocalSummary();
  }

  showSnack(text: string, kind: SnackKind = 'info', durationMs = 3000) {
    const id = Math.random().toString(36).substring(7);
    this.snacks = [...this.snacks, { id, text, kind }];
    if (durationMs > 0) setTimeout(() => this.dismissSnack(id), durationMs);
  }
  dismissSnack(id: string) { this.snacks = this.snacks.filter(s => s.id !== id); }

  onClose(): void {
    this.close.emit();
    this.router.navigate(['/tax-calendar']);
  }

  blockInvalidNumberKeys(evt: KeyboardEvent) {
    const blocked = ['-', '+', 'e', 'E'];
    if (blocked.includes(evt.key)) evt.preventDefault();
  }

  onNumberInput(control: keyof EstimatorInput, event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value ?? '';
    let cleaned = raw.replace(/[^0-9.]/g, '');
    cleaned = cleaned.replace(/(\..*)\./g, '$1');

    const n = cleaned === '' ? NaN : parseFloat(cleaned);
    if (!Number.isFinite(n)) {
      this.form.get(String(control))?.setValue(0, { emitEvent: false });
      input.value = '';
      this.summary = this.computeLocalSummary();
      return;
    }

    const clamped = Math.max(0, n);
    this.form.get(String(control))?.setValue(clamped, { emitEvent: false });
    input.value = String(clamped);
    this.summary = this.computeLocalSummary();
  }

  calc(): void {
    const v = this.form.value as EstimatorInput;
    this.summary = this.computeLocalSummary();
    this.status = 'calculating';
    this.showSnack('Calculating on server…', 'info', 1500);

    const taxYear = 2025;
    this.taxSvc.calculateEstimateBackend(v, taxYear).subscribe({
      next: (serverSummary) => {
        this.status = 'success';
        this.showSnack('Done! Tax calculated based on Indian slabs and record saved.', 'success');

        const valid = serverSummary && [serverSummary.gross, serverSummary.deductions, serverSummary.taxable, serverSummary.estimatedTax].every(x => typeof x === 'number' && isFinite(x as number));
        if (valid) {
          const local = this.computeLocalSummary();
          const serverEst = Number(serverSummary.estimatedTax) || 0;
          this.summary = serverEst > 0 ? {
            gross: Number(serverSummary.gross) || local.gross,
            deductions: Number(serverSummary.deductions) || local.deductions,
            taxable: Number(serverSummary.taxable) || local.taxable,
            estimatedTax: serverEst
          } : local;
        }

        const q = (this.form.value.quarter as Q) || 'Q1';
        const due = this.estimateDueDate(q, taxYear, this.form.value.country);
        const paymentTitle = `${q} Estimated Tax Payment`;
        const reminderTitle = `Reminder: ${q} Estimated Tax Payment`;
        const reminderDate = new Date(due.getTime() - 14 * 24 * 60 * 60 * 1000);

        const payment$ = this.calendarSvc.addItem({ title: paymentTitle, date: this.toISODate(due), note: `Estimated tax payment due on ${due.toDateString()}.` }).pipe(catchError(() => of(null)));
        const reminder$ = this.calendarSvc.addItem({ title: reminderTitle, date: this.toISODate(reminderDate), note: `Reminder for upcoming ${q} estimated tax payment due on ${due.toDateString()}.` }).pipe(catchError(() => of(null)));

        forkJoin([payment$, reminder$]).subscribe(([p, r]) => {
          const count = (p ? 1 : 0) + (r ? 1 : 0);
          if (count > 0) this.showSnack(`Calendar updated with ${count} items.`, 'success');
        });
      },
      error: (err) => {
        this.status = 'error';
        this.showSnack('Backend unavailable — showing local estimate.', 'error');
      },
    });
  }

  private computeLocalSummary(): TaxSummary {
    const n = (x: any) => (isFinite(+x) ? +x : 0);
    const gross = Math.max(0, n(this.form.value.grossIncome));
    const deductions = Math.max(0, n(this.form.value.businessExpenses)) + Math.max(0, n(this.form.value.retirement)) + Math.max(0, n(this.form.value.health)) + Math.max(0, n(this.form.value.homeOffice));
    const taxable = Math.max(0, gross - deductions);

    // Simplified Indian slabs for local calculation
    let tax = 0;
    if (taxable <= 250000) tax = 0;
    else if (taxable <= 500000) tax = (taxable - 250000) * 0.05;
    else if (taxable <= 1000000) tax = 12500 + (taxable - 500000) * 0.2;
    else tax = 112500 + (taxable - 1000000) * 0.3;

    return { gross, deductions, taxable, estimatedTax: Math.round(tax) };
  }

  private estimateDueDate(q: Q, year: number, _country: string): Date {
    switch (q) {
      case 'Q1': return new Date(year, 3, 15);
      case 'Q2': return new Date(year, 5, 15);
      case 'Q3': return new Date(year, 8, 15);
      case 'Q4': return new Date(year + 1, 0, 15);
    }
  }

  private toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  asCurrency(n: number): string {
    return isFinite(n) ? n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '—';
  }
}

