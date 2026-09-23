import { inject } from '@angular/core';
import { CanMatchFn, Route, Routes, UrlSegment } from '@angular/router';
import { ApiService } from './core/api.service';

export const authGuard: CanMatchFn = async (route: Route, segments: UrlSegment[]) => {
  const api = inject(ApiService);

  // On any route, check for ?token= query param to consume the JWT from OAuth callback
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
  // ---------------------------------------------------------------------------
  // Public Organization Website (Official RYVL Esports Shell & Pages)
  // ---------------------------------------------------------------------------
  {
    path: '',
    loadComponent: () =>
      import('./features/public/public-shell.component').then((m) => m.PublicShellComponent),
    children: [
      { path: 'live', pathMatch: 'full', redirectTo: 'match-center' },
      { path: 'privacy', title: 'Privacy Policy | RYVL Esports', data: { kind: 'privacy' }, loadComponent: () => import('./features/public/legal.component').then(m => m.LegalComponent) },
      { path: 'terms', title: 'Terms of Service | RYVL Esports', data: { kind: 'terms' }, loadComponent: () => import('./features/public/legal.component').then(m => m.LegalComponent) },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/public/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/public/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'performance',
        loadComponent: () =>
          import('./features/public/performance.component').then((m) => m.PerformanceComponent),
      },
      { path: 'competitions', pathMatch: 'full', redirectTo: 'performance' },
      {
        path: 'results',
        loadComponent: () =>
          import('./features/public/results.component').then((m) => m.ResultsComponent),
      },
      {
        path: 'fixtures',
        loadComponent: () =>
          import('./features/public/fixtures.component').then((m) => m.FixturesComponent),
      },
      {
        path: 'standings',
        loadComponent: () =>
          import('./features/public/standings.component').then((m) => m.StandingsComponent),
      },
      {
        path: 'match-center',
        loadComponent: () =>
          import('./features/public/live.component').then((m) => m.LiveComponent),
      },
      {
        path: 'recruitment',
        loadComponent: () =>
          import('./features/public/recruitment.component').then((m) => m.RecruitmentComponent),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./features/public/about.component').then((m) => m.AboutComponent),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./features/public/contact.component').then((m) => m.ContactComponent),
      },
      // Public viewer access to Club & Transfers from website
      {
        path: 'club',
        loadComponent: () =>
          import('./features/public/club.component').then((m) => m.PublicClubComponent),
      },
      {
        path: 'transfers',
        loadComponent: () =>
          import('./features/vpg-transfers/vpg-transfers.component').then((m) => m.VpgTransfersComponent),
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Admin Management Console (Bot, Events, Lineups, Settings)
  // ---------------------------------------------------------------------------
  {
    path: 'admin',
    pathMatch: 'full',
    redirectTo: 'admin/dashboard',
  },
  {
    path: 'admin/dashboard',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'admin/events',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-list.component').then((m) => m.EventListComponent),
  },
  {
    path: 'admin/events/new',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-create.component').then((m) => m.EventCreateComponent),
  },
  {
    path: 'admin/events/:eventId',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/events/event-detail.component').then((m) => m.EventDetailComponent),
  },
  {
    path: 'admin/lineup',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/lineup/lineup.component').then((m) => m.LineupComponent),
  },
  {
    path: 'admin/lineup/drafts',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/lineup/lineup-drafts.component').then((m) => m.LineupDraftsComponent),
  },
  {
    path: 'admin/club',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/ea-tracker/ea-tracker.component').then((m) => m.EaTrackerComponent),
  },
  {
    path: 'admin/transfers',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/vpg-transfers/vpg-transfers.component').then((m) => m.VpgTransfersComponent),
  },
  {
    path: 'admin/performance',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/performance/admin-performance.component').then(
        (m) => m.AdminPerformanceComponent,
      ),
  },
  {
    path: 'admin/settings',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },

  // ---------------------------------------------------------------------------
  // Legacy Direct Redirects (for backwards compatibility)
  // ---------------------------------------------------------------------------
  {
    path: 'dashboard',
    redirectTo: 'admin/dashboard',
  },
  {
    path: 'events',
    redirectTo: 'admin/events',
  },
  {
    path: 'events/new',
    redirectTo: 'admin/events/new',
  },
  {
    path: 'events/:eventId',
    redirectTo: 'admin/events/:eventId',
  },
  {
    path: 'lineup',
    redirectTo: 'admin/lineup',
  },
  {
    path: 'lineup/drafts',
    redirectTo: 'admin/lineup/drafts',
  },
  {
    path: 'settings',
    redirectTo: 'admin/settings',
  },

  {
    path: '**',
    redirectTo: '',
  },
];
