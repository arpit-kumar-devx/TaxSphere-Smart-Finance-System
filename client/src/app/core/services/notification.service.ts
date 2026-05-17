import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer } from 'rxjs';
import { switchMap, tap, shareReplay, retry } from 'rxjs/operators';

export interface AppNotification {
  _id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly base = '/api/v1/admin/notifications';
  
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();
  
  private unreadCountSubject = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) {
    // Poll for new notifications every 60 seconds
    timer(0, 60000).pipe(
      switchMap(() => this.getNotifications()),
      retry()
    ).subscribe();
  }

  getNotifications(): Observable<{ items: AppNotification[] }> {
    return this.http.get<{ items: AppNotification[] }>(this.base).pipe(
      tap(res => {
        this.notificationsSubject.next(res.items);
        this.unreadCountSubject.next(res.items.filter(n => !n.read).length);
      })
    );
  }

  markAsRead(id: string): Observable<any> {
    return this.http.patch(`${this.base}/${id}/read`, {}).pipe(
      tap(() => {
        const current = this.notificationsSubject.value;
        const updated = current.map(n => n._id === id ? { ...n, read: true } : n);
        this.notificationsSubject.next(updated);
        this.unreadCountSubject.next(updated.filter(n => !n.read).length);
      })
    );
  }

  markAllAsRead(): Observable<any> {
    return this.http.patch(`${this.base}/read-all`, {}).pipe(
      tap(() => {
        const current = this.notificationsSubject.value;
        const updated = current.map(n => ({ ...n, read: true }));
        this.notificationsSubject.next(updated);
        this.unreadCountSubject.next(0);
      })
    );
  }
}
