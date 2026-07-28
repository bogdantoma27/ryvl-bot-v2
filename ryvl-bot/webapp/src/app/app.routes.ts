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
		path: 'attendance',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/attendance-page.component').then(m => m.AttendancePageComponent),
	},
	{
		path: 'lineup',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/lineup-page.component').then(m => m.LineupPageComponent),
	},
	{
		path: 'settings',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/settings-page.component').then(m => m.SettingsPageComponent),
	},
	{
		path: 'diagnostics',
		canMatch: [requireLogin],
		loadComponent: () => import('./features/pages/diagnostics-page.component').then(m => m.DiagnosticsPageComponent),
	},
	{ path: '**', redirectTo: '' },
];
