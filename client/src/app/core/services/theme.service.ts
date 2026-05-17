import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeKey = 'theme-mode';
  public theme = signal<ThemeMode>('light');

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem(this.themeKey) as ThemeMode | null;
      const initial: ThemeMode = saved === 'dark' ? 'dark' : 'light';
      this.theme.set(initial);
      this.applyTheme();
    }
  }

  toggleTheme() {
    this.theme.update(cur => (cur === 'dark' ? 'light' : 'dark'));
    this.applyTheme();
  }

  currentThemeLabel(): string {
    return this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  applyTheme() {
    if (!isPlatformBrowser(this.platformId)) return;
    const mode = this.theme();
    localStorage.setItem(this.themeKey, mode);
    document.body.classList.toggle('dark-theme', mode === 'dark');
    document.body.classList.toggle('light-theme', mode === 'light');
  }
}
