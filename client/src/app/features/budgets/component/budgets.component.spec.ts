import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BudgetsComponent } from './budgets.component';
import { BudgetService } from '../../../core/services/budget.service';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';

describe('BudgetsComponent', () => {
  let fixture: ComponentFixture<BudgetsComponent>;
  let comp: BudgetsComponent;
  let budgetSvc: jasmine.SpyObj<BudgetService>;

  beforeEach(async () => {
    budgetSvc = jasmine.createSpyObj('BudgetService', ['getCurrent', 'getPreviousMonth', 'createOrUpdate']);
    budgetSvc.getCurrent.and.returnValue(of(null));
    budgetSvc.getPreviousMonth.and.returnValue(of(null));

    const socketSvc = jasmine.createSpyObj('SocketService', ['on']);
    socketSvc.on.and.returnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [BudgetsComponent],
      providers: [
        { provide: BudgetService, useValue: budgetSvc },
        { provide: SocketService, useValue: socketSvc },
        { provide: Router, useValue: { navigate: () => {} } },
        { provide: ToastService, useValue: { success: () => {}, info: () => {} } },
        { provide: MatSnackBar, useValue: { open: () => {} } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetsComponent);
    comp = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(comp).toBeTruthy();
  });
});
