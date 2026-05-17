import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { BudgetService, Budget, CreateBudgetDto } from '../../../core/services/budget.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-budget-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="form-container glass-card slide-up">
      <div class="form-header">
        <div class="title-group">
          <h2>{{ editing ? 'Update Monthly Budget' : 'Create Monthly Budget' }}</h2>
          <p>Plan category-wise allocations for smarter monthly control.</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="premium-form">
        <!-- PRIMARY CONFIG -->
        <div class="form-row main-config">
          <div class="input-group-premium">
             <label>Billing Month</label>
             <div class="input-wrapper">
                <i class="icon">📅</i>
                <input type="month" formControlName="month" />
             </div>
             <p class="field-error" *ngIf="showError('month', 'required')">Billing month is required.</p>
          </div>
          
          <div class="input-group-premium">
             <label>Total Monthly Capacity</label>
             <div class="input-wrapper">
                <span class="currency">₹</span>
                <input type="number" formControlName="totalBudget" placeholder="0.00" />
             </div>
             <p class="field-error" *ngIf="showError('totalBudget', 'required')">Monthly capacity is required.</p>
             <p class="field-error" *ngIf="showError('totalBudget', 'min')">Monthly capacity must be greater than zero.</p>
          </div>
        </div>

        <div class="divider"></div>

        <!-- CATEGORIES SECTION -->
        <div class="categories-section">
           <div class="section-header">
              <h3>Targeted Allocations</h3>
              <button type="button" class="btn-add-cat" (click)="addCategory()">
                <span>+</span> Add Category
              </button>
           </div>

           <div formArrayName="categories" class="categories-list">
              <div *ngFor="let catGroup of categoryControls; let i = index" [formGroupName]="i" class="category-row-entry fade-in">
                 <div class="cat-input name">
                    <input type="text" formControlName="name" placeholder="Category Name" />
                    <p class="field-error" *ngIf="showCategoryError(i, 'name', 'required')">Name is required.</p>
                 </div>
                 <div class="cat-input limit">
                    <span class="curr-small">₹</span>
                    <input type="number" formControlName="limit" placeholder="Limit" />
                    <p class="field-error" *ngIf="showCategoryError(i, 'limit', 'required')">Amount is required.</p>
                    <p class="field-error" *ngIf="showCategoryError(i, 'limit', 'min')">Amount cannot be negative.</p>
                 </div>
                 <button type="button" class="btn-remove" (click)="removeCategory(i)">✕</button>
              </div>
           </div>

           <div *ngIf="!categoryControls.length" class="empty-cats">
              No specific category limits set. Click "Add Category" to track specific areas.
           </div>

           <div class="allocation-summary">
             <span>Total Allocated: <strong>₹{{ totalAllocated | number:'1.0-0' }}</strong></span>
             <span>Remaining: <strong [class.warn]="remainingToAllocate < 0">₹{{ remainingToAllocate | number:'1.0-0' }}</strong></span>
           </div>
           <p class="warn-text" *ngIf="remainingToAllocate < 0">
             Category allocation exceeds monthly budget by ₹{{ (remainingToAllocate * -1) | number:'1.0-0' }}.
           </p>
        </div>

        <!-- ACTIONS -->
        <div class="form-footer">
           <button *ngIf="showCancel" type="button" class="btn-secondary" (click)="cancel.emit()">Abort</button>
           <button type="submit" class="btn-submit" [disabled]="form.invalid || submitting || remainingToAllocate < 0">
              <div *ngIf="submitting" class="spinner"></div>
              {{ editing ? 'Save Budget Changes' : 'Create Budget' }}
           </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-container { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 2rem; padding: 2.5rem; max-width: 900px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    .form-header { margin-bottom: 2.5rem; }
    .form-header h2 { font-size: 1.8rem; font-weight: 800; margin: 0; color: #111827; }
    .form-header p { color: #64748b; margin-top: 0.5rem; }

    .form-row.main-config { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    
    .input-group-premium label { display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #374151; margin-bottom: 0.75rem; letter-spacing: 0.05em; }
    .input-wrapper { position: relative; display: flex; align-items: center; }
    .input-wrapper .icon, .input-wrapper .currency { position: absolute; left: 1rem; color: #6366f1; font-weight: 700; font-style: normal; }
    .input-wrapper input { width: 100%; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 1rem; padding: 1.2rem 1.2rem 1.2rem 3rem; color: #111827; font-size: 1.1rem; transition: 0.3s; }
    .input-wrapper input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 15px rgba(99, 102, 241, 0.2); background: #ffffff; }

    .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent); margin: 2rem 0; }

    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .section-header h3 { font-size: 1.1rem; color: #111827; font-weight: 700; margin: 0; }
    .btn-add-cat { background: rgba(99, 102, 241, 0.1); color: #818cf8; border: 1px dashed rgba(99,102,241,0.4); padding: 0.5rem 1rem; border-radius: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; font-size: 0.85rem; }
    .btn-add-cat:hover { background: rgba(99, 102, 241, 0.2); transform: translateY(-2px); }

    .categories-list { display: grid; gap: 1rem; }
    .category-row-entry { display: grid; grid-template-columns: 1fr 1fr 40px; gap: 1rem; align-items: center; color: #111827; }
    .cat-input { position: relative; }
    .cat-input input { width: 100%; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.8rem 1rem; color: #111827; transition: 0.2s; }
    .cat-input.limit input { padding-left: 2rem; }
    .curr-small { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 0.9rem; }
    .cat-input input:focus { outline: none; border-color: rgba(99,102,241,0.5); background: #ffffff; }

    .btn-remove { background: none; border: none; color: #64748b; cursor: pointer; font-size: 1rem; transition: 0.2s; }
    .btn-remove:hover { color: #ef4444; transform: scale(1.2); }

    .empty-cats { text-align: center; color: #475569; padding: 2rem; background: rgba(0,0,0,0.1); border-radius: 1rem; font-style: italic; font-size: 0.9rem; }
    .allocation-summary { display: flex; justify-content: space-between; margin-top: 1rem; color: #334155; font-size: 0.9rem; }
    .allocation-summary strong.warn { color: #dc2626; }
    .warn-text { margin-top: 0.45rem; color: #dc2626; font-size: 0.82rem; }
    .field-error { margin-top: 0.3rem; color: #dc2626; font-size: 0.75rem; }

    .form-footer { margin-top: 3rem; display: flex; justify-content: flex-end; gap: 1.5rem; }
    .btn-secondary { background: none; border: 1px solid #475569; color: #94a3b8; padding: 1rem 2rem; border-radius: 1rem; font-weight: 700; cursor: pointer; }
    .btn-submit { background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: white; border: none; padding: 1rem 3rem; border-radius: 1rem; font-weight: 800; cursor: pointer; box-shadow: 0 10px 30px rgba(67, 56, 202, 0.4); display: flex; align-items: center; gap: 0.75rem; transition: 0.3s; }
    .btn-submit:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 15px 40px rgba(67, 56, 202, 0.5); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

    .spinner { width: 1.2rem; height: 1.2rem; border: 2px solid rgba(255,255,255,0.2); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.3s ease-out; }
    
    @media (max-width: 600px) {
      .form-row.main-config { grid-template-columns: 1fr; gap: 1rem; }
      .category-row-entry { grid-template-columns: 1fr 80px 30px; }
      .form-container { padding: 1.5rem; }
      .form-footer { flex-direction: column-reverse; }
      .btn-submit, .btn-secondary { width: 100%; }
      .allocation-summary { flex-direction: column; gap: 0.3rem; }
    }
  `]
})
export class BudgetFormComponent implements OnInit {
  @Input() initialData: Budget | null = null;
  @Input() editing = false;
  @Input() showCancel = false;
  
  @Output() saved = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  form!: FormGroup;
  submitting = false;

  constructor(
    private fb: FormBuilder,
    private budgetService: BudgetService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    const d = new Date();
    const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    this.form = this.fb.group({
      month: [this.initialData?.month || currentMonth, Validators.required],
      totalBudget: [this.initialData?.totalBudget || 0, [Validators.required, Validators.min(1)]],
      categories: this.fb.array([])
    });

    if (this.initialData?.categories?.length) {
      this.initialData.categories.forEach(c => this.addCategory(c.name, c.limit));
    } else if (!this.editing) {
      ['Groceries', 'Rent', 'Travel', 'Savings'].forEach(name => this.addCategory(name, 0));
    }
  }

  get monthText(): string {
    return this.form.get('month')?.value || '';
  }

  get categoriesArray() {
    return this.form.get('categories') as FormArray;
  }

  get categoryControls() {
    return this.categoriesArray.controls;
  }

  addCategory(name = '', limit = 0) {
    this.categoriesArray.push(this.fb.group({
      name: [name, Validators.required],
      limit: [limit, [Validators.required, Validators.min(0)]]
    }));
  }

  removeCategory(idx: number) {
    this.categoriesArray.removeAt(idx);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    
    this.submitting = true;
    const body: CreateBudgetDto = this.form.value;

    const saveSuccess = () => {
      this.submitting = false;
      this.toast.success(this.editing ? 'Budget updated successfully.' : 'Budget created successfully.');
      this.saved.emit();
    };

    const saveError = (e: any) => {
      this.submitting = false;
      const msg = e?.error?.message || 'Failed to save budget.';
      console.error('Budget save failed:', e);
      this.toast.error(msg);
    };

    const budgetId = this.initialData?._id;
    if (this.editing && budgetId) {
      this.budgetService.updateBudget(budgetId, body).subscribe({
        next: saveSuccess,
        error: (e) => {
          if (e?.status === 404) {
            this.budgetService.upsertBudget(body).subscribe({
              next: saveSuccess,
              error: saveError,
            });
            return;
          }
          saveError(e);
        },
      });
      return;
    }

    this.budgetService.upsertBudget(body).subscribe({
      next: saveSuccess,
      error: saveError,
    });
  }

  get totalAllocated(): number {
    return this.categoriesArray.controls.reduce((sum, g) => sum + Number(g.get('limit')?.value || 0), 0);
  }

  get remainingToAllocate(): number {
    return Number(this.form.get('totalBudget')?.value || 0) - this.totalAllocated;
  }

  showError(controlName: string, errorType: string): boolean {
    const control = this.form.get(controlName);
    return !!(control && control.hasError(errorType) && (control.touched || control.dirty));
  }

  showCategoryError(index: number, controlName: string, errorType: string): boolean {
    const control = this.categoriesArray.at(index)?.get(controlName);
    return !!(control && control.hasError(errorType) && (control.touched || control.dirty));
  }
}
