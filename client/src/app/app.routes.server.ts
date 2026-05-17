import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'app/itr/:id', renderMode: RenderMode.Server },
  { path: 'app/payment/:id', renderMode: RenderMode.Server },
  // Root level redirects for parameterized routes should also be handled consistently
  { path: 'itr/:id', renderMode: RenderMode.Server },
  { path: 'payment/:id', renderMode: RenderMode.Server },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
