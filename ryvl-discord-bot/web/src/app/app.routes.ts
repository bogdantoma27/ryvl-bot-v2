import { inject } from '@angular/core';
import { CanMatchFn, Route, Routes, UrlSegment } from '@angular/router';
import { ApiService } from './core/api.service';

export const authGuard: CanMatchFn = async (route: Route, segments: UrlSegment[]) => {
  const api = inject(ApiService);

  // On the root path or any entry, check for ?token= query param to consume the JWT from OAuth callback
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      api.setSessionToken(token);
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  const token = api.getSessionToken();
  if (!token) {
    return false;
  }

  try {
    const auth = await api.authMe();
    return Boolean(auth && (auth.authenticated || auth.user));
  } catch {
    return false;
  }
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'events',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-list.component').then((m) => m.EventListComponent),
  },
  {
    path: 'events/new',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-create.component').then((m) => m.EventCreateComponent),
  },
  {
    path: 'events/:eventId',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-detail.component').then((m) => m.EventDetailComponent),
  },
  {
    path: 'settings',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
