import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { CaSidebarComponent } from '../components/ca-sidebar/ca-sidebar.component';
import { CaTopbarComponent } from '../components/ca-topbar/ca-topbar.component';

@Component({
  selector: 'app-ca-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, CaSidebarComponent, CaTopbarComponent],
  templateUrl: './ca-layout.component.html',
  styleUrls: ['./ca-layout.component.css'],
})
export class CaLayoutComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  user$ = this.auth.currentUser$;
  sidebarOpen = false;
  platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.body.classList.add('ca-no-body-scroll');
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.body.classList.remove('ca-no-body-scroll');
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  logout(): void {
    this.auth.logout();
  }
}
