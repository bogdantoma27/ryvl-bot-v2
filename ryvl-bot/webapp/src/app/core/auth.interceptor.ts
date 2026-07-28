import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

let forcedLogoutInProgress = false;

export const authInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError(error => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        typeof window !== 'undefined' &&
        !request.url.includes('/api/auth/me') &&
        !request.url.includes('/api/auth/logout') &&
        !request.url.includes('/api/auth/discord')
      ) {
        if (forcedLogoutInProgress) {
          return throwError(() => error);
        }
        forcedLogoutInProgress = true;
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