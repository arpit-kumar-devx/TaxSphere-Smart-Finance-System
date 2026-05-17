import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  isSidebarOpen = signal(false);
  isSidebarCollapsed = signal(false);

  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  toggleCollapse() {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }
}
