import { inject } from '@angular/core';
import { CanMatchFn, Params, Router, Routes } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from './core/api.service';

export const authGuard: CanMatchFn = async () => {
  const api = inject(ApiService);
  const router = inject(Router);
  const login = (error?: string) => router.createUrlTree(['/admin/login'], {
    queryParams: error ? { error } : undefined,
  });

  // ApiService already consumes an OAuth token, when present. A missing session
  // must redirect to sign-in: returning false from canMatch falls through to home.
  const token = api.getSessionToken();
  if (!token) return login();
  try {
    const auth = await api.authMe();
    if (auth && (auth.authenticated || auth.user)) return true;
    if (api.getSessionToken() === token) api.setSessionToken(null);
    return login('session_expired');
  } catch (error: unknown) {
    const rejected = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
    if (rejected && api.getSessionToken() === token) api.setSessionToken(null);
    return login(rejected ? 'session_expired' : 'unavailable');
  }
};

type Section = 'club' | 'superliga' | 'community' | 'server';

/**
 * Redirect for a page that became a tab of a section (`/admin/<section>?tab=<tab>`).
 * Keeps the old URL's query parameters (e.g. a lineup `draftId`); `view` picks a
 * nested tab such as the awards' MVP / Team of the Week.
 */
const sectionTab = (section: Section, tab: string, view?: string) =>
  ({ queryParams }: { queryParams: Params }) =>
    inject(Router).createUrlTree(['/admin', section], {
      queryParams: { ...queryParams, tab, ...(view ? { view } : {}) },
    });

// The old awards page used ?tab=mvp|totw for its own tabs: carry that over as the view.
const awardsRedirect = ({ queryParams }: { queryParams: Params }) => {
  const { tab, ...rest } = queryParams;
  return inject(Router).createUrlTree(['/admin/superliga'], {
    queryParams: { ...rest, tab: 'awards', ...(tab === 'mvp' || tab === 'totw' ? { view: tab } : {}) },
  });
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
      // Public viewer access to Club from website
      {
        path: 'club',
        loadComponent: () =>
          import('./features/public/club.component').then((m) => m.PublicClubComponent),
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Admin Management Console (Bot, Events, Lineups, Settings)
  // ---------------------------------------------------------------------------
  // The sign-in page is public; all workspace routes below keep their guard.
  {
    path: 'admin/login',
    title: 'Staff sign-in | RYVL Esports',
    loadComponent: () => import('./features/auth/admin-login.component').then(m => m.AdminLoginComponent),
  },
  {
    path: 'docs',
    title: 'Bot Documentation | RYVL',
    loadComponent: () => import('./features/docs/bot-docs.component').then((m) => m.BotDocsComponent),
  },
  {
    path: 'admin/docs',
    title: 'Bot Documentation | RYVL',
    loadComponent: () => import('./features/docs/bot-docs.component').then((m) => m.BotDocsComponent),
  },
  {
    path: 'admin',
    pathMatch: 'full',
    redirectTo: 'admin/dashboard',
  },
  {
    path: 'admin/dashboard',
    canMatch: [authGuard],
    title: 'Overview | RYVL Admin',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  // Five tabbed sections; every tab is lazy-loaded by its section (see admin-sections/).
  {
    path: 'admin/club',
    canMatch: [authGuard],
    title: 'Club | RYVL Admin',
    loadComponent: () =>
      import('./features/admin-sections/club-section.component').then((m) => m.ClubSectionComponent),
  },
  {
    path: 'admin/superliga',
    canMatch: [authGuard],
    title: 'Superliga | RYVL Admin',
    loadComponent: () =>
      import('./features/admin-sections/superliga-section.component').then((m) => m.SuperligaSectionComponent),
  },
  {
    path: 'admin/community',
    canMatch: [authGuard],
    title: 'Community | RYVL Admin',
    loadComponent: () =>
      import('./features/admin-sections/community-section.component').then((m) => m.CommunitySectionComponent),
  },
  {
    path: 'admin/server',
    canMatch: [authGuard],
    title: 'Server | RYVL Admin',
    loadComponent: () =>
      import('./features/admin-sections/server-section.component').then((m) => m.ServerSectionComponent),
  },
  // Creating and viewing one event keep their own pages.
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

  // Pages that became section tabs.
  { path: 'admin/events', pathMatch: 'full', redirectTo: sectionTab('community', 'events') },
  { path: 'admin/tournaments', pathMatch: 'full', redirectTo: sectionTab('community', 'tournaments') },
  { path: 'admin/lineup', pathMatch: 'full', redirectTo: sectionTab('club', 'lineup') },
  { path: 'admin/lineup/drafts', pathMatch: 'full', redirectTo: sectionTab('club', 'drafts') },
  { path: 'admin/performance', pathMatch: 'full', redirectTo: sectionTab('club', 'performance') },
  { path: 'admin/transfers', pathMatch: 'full', redirectTo: sectionTab('superliga', 'transfers') },
  { path: 'admin/superliga-awards', pathMatch: 'full', redirectTo: awardsRedirect },
  { path: 'admin/totw', pathMatch: 'full', redirectTo: sectionTab('superliga', 'awards', 'totw') },
  { path: 'admin/superliga-mvp', pathMatch: 'full', redirectTo: sectionTab('superliga', 'awards', 'mvp') },
  { path: 'admin/settings', pathMatch: 'full', redirectTo: sectionTab('server', 'general') },

  // ---------------------------------------------------------------------------
  // Legacy Direct Redirects (for backwards compatibility)
  // ---------------------------------------------------------------------------
  { path: 'dashboard', redirectTo: 'admin/dashboard' },
  { path: 'events', pathMatch: 'full', redirectTo: sectionTab('community', 'events') },
  { path: 'events/new', redirectTo: 'admin/events/new' },
  { path: 'events/:eventId', redirectTo: 'admin/events/:eventId' },
  { path: 'lineup', pathMatch: 'full', redirectTo: sectionTab('club', 'lineup') },
  { path: 'lineup/drafts', pathMatch: 'full', redirectTo: sectionTab('club', 'drafts') },
  { path: 'totw', pathMatch: 'full', redirectTo: sectionTab('superliga', 'awards', 'totw') },
  { path: 'tournaments', pathMatch: 'full', redirectTo: sectionTab('community', 'tournaments') },
  { path: 'settings', pathMatch: 'full', redirectTo: sectionTab('server', 'general') },

  {
    path: '**',
    redirectTo: '',
  },
];
