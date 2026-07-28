import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ApiService } from './api.service';

let forcedLogoutInProgress = false;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const api = inject(ApiService);
  const sessionToken = api.getSessionToken();
  const authRequest = sessionToken && !request.headers.has('Authorization')
    ? request.clone({ setHeaders: { Authorization: `Bearer ${sessionToken}` } })
    : request;

  return next(authRequest).pipe(
    catchError(error => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        typeof window !== 'undefined' &&
        !authRequest.url.includes('/api/auth/me') &&
        !authRequest.url.includes('/api/auth/logout') &&
        !authRequest.url.includes('/api/auth/discord')
      ) {
        if (forcedLogoutInProgress) {
          return throwError(() => error);
        }
        forcedLogoutInProgress = true;
        api.setSessionToken(null);
        const runtimeValue = String((window as Window & { __RYVL_API_BASE_URL__?: string }).__RYVL_API_BASE_URL__ || '').trim();
        let logoutUrl = '/api/auth/logout';
        if (runtimeValue) {
          logoutUrl = `${runtimeValue}/api/auth/logout`;
        } else if (window.location.hostname === 'localhost' && window.location.port === '4200') {
          logoutUrl = 'http://localhost:8000/api/auth/logout';
        } else if (window.location.origin) {
          logoutUrl = `${window.location.origin}/api/auth/logout`;
        }
        void fetch(logoutUrl, { method: 'POST', credentials: 'include' }).catch(() => undefined).finally(() => {
          const url = new URL(window.location.href);
          url.pathname = '/';
          url.search = '';
          url.hash = '';
          window.location.assign(url.toString());
        });
      }
      return throwError(() => error);
    }),
  );
};