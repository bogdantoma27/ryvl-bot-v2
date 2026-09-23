import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiService } from './api.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const token = api.getSessionToken();

  const authenticatedRequest = token && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // The transport must not start a competing navigation on /auth/me failures.
  // The admin guard and shell own expired-session cleanup and the sign-in URL;
  // navigating home here used to cancel their redirect, especially on first load.
  // Preserve the HTTP error so callers can distinguish 401 from an outage.
  return next(authenticatedRequest);
};
