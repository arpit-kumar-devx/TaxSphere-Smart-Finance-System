import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

// Shared event payload contracts (keep in sync with server emits)
export interface TransactionAddedEvent {
  _id: string;
  userId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  date: string | Date;
  createdAt?: string | Date;
}

export interface TransactionUpdatedEvent extends TransactionAddedEvent {}
export interface TransactionDeletedEvent { _id: string; userId: string; }

export interface BudgetUpdatedEvent {
  userId: string;
  month: string; // YYYY-MM
  totalBudget: number;
  totalSpent: number;
  categories: Array<{ name: string; limit: number; spent?: number }>;
  deleted?: boolean;
}

export interface BudgetRefreshEvent {
  userId: string;
  reason: string;
}

export interface AnalyticsRefreshEvent {
  userId: string;
  reason: string;
}

export interface TransactionUpdateEvent {
  userId: string;
  reason: string;
}

export type ReminderUpdatedEvent =
  | { type: 'created'; event: any }
  | { type: 'updated'; event: any }
  | { type: 'deleted'; id: string }
  | { type: 'bulkDeleted'; deletedCount: number };

export interface ItrUpdatedEvent {
  id: string;
  userId: string;
  status: string;
  taxSummary?: any;
  caRemarks?: string;
}

export interface PaymentUpdatedEvent {
  itrId: string;
  userId: string;
  amount: number;
  status: string;
  payment: any;
}

export interface SocketEventMap {
  transaction_update: TransactionUpdateEvent;
  transactionAdded: TransactionAddedEvent;
  transactionUpdated: TransactionUpdatedEvent;
  transactionDeleted: TransactionDeletedEvent;
  budgetUpdated: BudgetUpdatedEvent;
  budgetRefresh: BudgetRefreshEvent;
  analyticsRefresh: AnalyticsRefreshEvent;
  reminderUpdated: ReminderUpdatedEvent;
  itrUpdated: ItrUpdatedEvent;
  paymentUpdated: PaymentUpdatedEvent;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private subjects = new Map<keyof SocketEventMap, Subject<any>>();

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    if (isPlatformBrowser(platformId)) {
      this.socket = io('/', {
        withCredentials: true,
      });

      ([
        'transaction_update',
        'transactionAdded',
        'transactionUpdated',
        'transactionDeleted',
        'budgetUpdated',
        'budgetRefresh',
        'analyticsRefresh',
        'reminderUpdated',
        'itrUpdated',
        'paymentUpdated',
      ] as (keyof SocketEventMap)[]).forEach((event) => {
        const subj = this.ensureSubject(event);
        this.socket!.on(event, (payload: any) => {
          subj.next(payload);
        });
      });
    }
  }

  on<K extends keyof SocketEventMap>(event: K): Observable<SocketEventMap[K]> {
    const subj = this.ensureSubject(event);
    return subj.asObservable();
  }

  private ensureSubject<K extends keyof SocketEventMap>(event: K): Subject<SocketEventMap[K]> {
    let subj = this.subjects.get(event);
    if (!subj) {
      subj = new Subject<SocketEventMap[K]>();
      this.subjects.set(event, subj);
    }
    return subj as Subject<SocketEventMap[K]>;
  }
}
