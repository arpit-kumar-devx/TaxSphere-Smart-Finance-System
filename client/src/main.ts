(window as any).mgt = (window as any).mgt || {};
if ((window as any).mgt?.clearMarks) {
  (window as any).mgt.clearMarks();
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err: any) => console.error(err));
