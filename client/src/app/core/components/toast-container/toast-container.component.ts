import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-host">
      <div
        *ngFor="let t of toasts"
        class="toast"
        [ngClass]="{
          'toast--success': t.kind === 'success',
          'toast--info': t.kind === 'info',
          'toast--error': t.kind === 'error'
        }"
        (click)="dismiss(t.id)"
      >
        <span class="toast__msg">{{ t.message }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./toast-container.component.css'],
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private sub?: Subscription;

  constructor(private toastsSvc: ToastService) {}

  ngOnInit(): void {
    this.sub = this.toastsSvc.toasts$.subscribe((list) => (this.toasts = list));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(id: number) {
    this.toastsSvc.dismiss(id);
  }
}

