import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';

import { ApiService } from './core/api.service';

const requireLogin: CanMatchFn = () => {
	const api = inject(ApiService);
	const router = inject(Router);
	return api.authMe()
		.then(result => (result.authenticated ? true : router.parseUrl('/')))
		.catch(() => router.parseUrl('/'));
};

export const routes: Routes = [
	{
		path: 'events',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/events-list-page.component').then(m => m.EventsListPageComponent),
	},
	{
		path: 'events/new',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/event-wizard-page.component').then(m => m.EventWizardPageComponent),
	},
	{
		path: 'events/drafts',
		canMatch: [requireLogin],
		data: { mode: 'drafts' },
		loadComponent: () => import('./features/pages/event-collection-page.component').then(m => m.EventCollectionPageComponent),
	},
	{
		path: 'events/recurring',
		canMatch: [requireLogin],
		data: { mode: 'recurring' },
		loadComponent: () => import('./features/pages/event-collection-page.component').then(m => m.EventCollectionPageComponent),
	},
	{
		path: 'events/scheduled',
		canMatch: [requireLogin],
		data: { mode: 'scheduled' },
		loadComponent: () => import('./features/pages/event-collection-page.component').then(m => m.EventCollectionPageComponent),
	},
	{
		path: 'events/manage',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/event-manage-page.component').then(m => m.EventManagePageComponent),
	},
	{
		path: 'lineup',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/lineup-page.component').then(m => m.LineupPageComponent),
	},
	{
		path: 'lineup/drafts',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/lineup-drafts-page.component').then(m => m.LineupDraftsPageComponent),
	},
	{
		path: 'vpg',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/vpg-overview-page.component').then(m => m.VpgOverviewPageComponent),
	},
	{
		path: 'vpg/schedules',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/vpg-schedules-page.component').then(m => m.VpgSchedulesPageComponent),
	},
	{
		path: 'vpg/transfers',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/vpg-transfers-page.component').then(m => m.VpgTransfersPageComponent),
	},
	{
		path: 'settings',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/account-page.component').then(m => m.AccountPageComponent),
	},
	{ path: 'attendance', redirectTo: 'events' },
	{ path: 'attendance/manage', redirectTo: 'events/manage' },
	{ path: 'attendance/drafts', redirectTo: 'events/drafts' },
	{ path: 'attendance/recurring', redirectTo: 'events/recurring' },
	{ path: 'attendance/scheduled', redirectTo: 'events/scheduled' },
	{ path: 'diagnostics', redirectTo: 'events' },
	{ path: '**', redirectTo: '' },
];
