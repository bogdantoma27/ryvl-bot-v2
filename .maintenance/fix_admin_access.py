from pathlib import Path

root = Path('ryvl-discord-bot')
web = root / 'web/src/app'

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Expected exactly one original block: ' + old[:100])
    return text.replace(old, new, 1)

# Keep the existing sign-in design, but make it an actual, unguarded route.
app_path = web / 'app.ts'
app = app_path.read_text()
start = app.index('        <!-- Unauthenticated State: Discord Login Screen for Admin Console -->')
end = app.index('      } @else {\n        <!-- Authenticated Admin Layout:', start)
login_markup = app[start:end]
login_markup = replace_once(login_markup, '<div class="space-y-3 pt-2">', '''<div class="space-y-3 pt-2">
              @if(errorMessage()) {
                <p role="alert" class="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{{ errorMessage() }}</p>
              }
              @if(isUnavailable()) {
                <a routerLink="/admin/dashboard" class="block rounded-xl border border-white/20 px-4 py-3 text-sm text-white hover:bg-white/10">Try again</a>
              }''')
login_component = '''import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';

// This page is intentionally unguarded. Protected admin routes redirect here;
// being able to view this form does not grant any API or administrative access.
@Component({
  selector: 'app-admin-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
''' + login_markup + '''  `,
})
export class AdminLoginComponent {
  private readonly api = inject(ApiService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly isUnavailable = computed(() => this.params()?.get('error') === 'unavailable');
  readonly errorMessage = computed(() => {
    // Use fixed messages, never reflect arbitrary OAuth error text into the UI.
    switch (this.params()?.get('error')) {
      case 'access_denied': return 'Discord sign-in was cancelled. You can try again.';
      case 'session_expired': return 'Your session has expired. Sign in with Discord again.';
      case 'unavailable': return 'Sign-in verification is temporarily unavailable. Please try again.';
      case 'auth_failed':
      case 'missing_code': return 'Discord sign-in could not be completed. Please try again.';
      default: return '';
    }
  });

  loginWithDiscord(): void {
    // The existing same-origin endpoint keeps the configured HTTPS callback.
    window.location.assign(this.api.getDiscordLoginUrl());
  }
}
'''
login_path = web / 'features/auth/admin-login.component.ts'
login_path.parent.mkdir(parents=True, exist_ok=True)
login_path.write_text(login_component)

# The login component needs an outlet even without an authenticated admin shell.
app = app[:start] + '''        <!-- A protected view never mounts before authentication completes. -->
        <div class="min-h-screen flex items-center justify-center bg-[#080808] text-slate-200">
          <a routerLink="/admin/login" class="public-button">Go to staff sign-in</a>
        </div>
''' + app[end:]
app = replace_once(app, '@if (!isAdminRoute()) {', '@if (!isAdminRoute() || isLoginRoute()) {')
app = "import { HttpErrorResponse } from '@angular/common/http';\n" + app
app = replace_once(app, "  readonly isAdminRoute = computed(() => this.currentPath().startsWith('/admin'));", '''  readonly isAdminRoute = computed(() => /^\\/admin(?:\\/|[?#]|$)/.test(this.currentPath()));
  readonly isLoginRoute = computed(() => this.currentPath().split(/[?#]/, 1)[0] === '/admin/login');
  private authCheckVersion = 0;''')
app = replace_once(app, '        this.currentPath.set(event.urlAfterRedirects || event.url);', '''        this.currentPath.set(event.urlAfterRedirects || event.url);
        if (this.isLoginRoute()) {
          // Cancel stale shell checks: an expired session must not keep showing
          // a cached authenticated workspace after the route guard rejects it.
          this.authCheckVersion++;
          this.isAuthenticated.set(false);
          this.currentUser.set(null);
          this.isAuthChecking.set(false);
        } else if (this.isAdminRoute() && !this.isAuthenticated() && !this.isAuthChecking()) {
          // A session can be discovered after public-site startup, including an
          // OAuth return or another tab. Refresh the shell as well as the guard.
          void this.checkAuth();
        }''')
start = app.index('  async checkAuth(): Promise<void> {')
end = app.index('\n  loginWithDiscord(): void {', start)
app = app[:start] + '''  async checkAuth(): Promise<void> {
    const version = ++this.authCheckVersion;
    this.isAuthChecking.set(true);
    const token = this.api.getSessionToken();
    if (!token) {
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
      this.isAuthChecking.set(false);
      return;
    }

    let failure: 'session_expired' | 'unavailable' | null = null;
    try {
      const auth = await this.api.authMe();
      // Never let an old request overwrite a newer login or logout.
      if (version !== this.authCheckVersion || this.api.getSessionToken() !== token) return;
      if (auth && (auth.authenticated || auth.user)) {
        this.isAuthenticated.set(true);
        this.currentUser.set(auth.user || null);
        await this.guildStore.loadGuilds();
      } else {
        failure = 'session_expired';
        this.api.setSessionToken(null);
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
      }
    } catch (error: unknown) {
      if (version !== this.authCheckVersion || this.api.getSessionToken() !== token) return;
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
      const rejected = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
      // A network/server outage is not evidence that the session has expired.
      if (rejected) this.api.setSessionToken(null);
      failure = rejected ? 'session_expired' : 'unavailable';
    } finally {
      if (version === this.authCheckVersion) this.isAuthChecking.set(false);
    }
    if (failure && version === this.authCheckVersion && this.router.url.startsWith('/admin/') && !this.isLoginRoute()) {
      await this.router.navigate(['/admin/login'], { queryParams: { error: failure }, replaceUrl: true });
    }
  }
''' + app[end:]
# Login is now owned by its routed component, not duplicated in the application shell.
app = replace_once(app, '''  loginWithDiscord(): void {
    window.location.href = this.api.getDiscordLoginUrl();
  }

''', '')
app_path.write_text(app)

routes_path = web / 'app.routes.ts'
routes = routes_path.read_text()
start = routes.index('export const authGuard: CanMatchFn =')
end = routes.index('\nexport const routes: Routes =', start)
routes = routes[:start] + '''export const authGuard: CanMatchFn = async () => {
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
''' + routes[end:]
routes = replace_once(routes, "import { CanMatchFn, Route, Routes, UrlSegment } from '@angular/router';", "import { CanMatchFn, Router, Routes } from '@angular/router';\nimport { HttpErrorResponse } from '@angular/common/http';")
routes = replace_once(routes, '''  {
    path: 'admin',
''', '''  // The sign-in page is public; all workspace routes below keep their guard.
  {
    path: 'admin/login',
    title: 'Staff sign-in | RYVL Esports',
    loadComponent: () => import('./features/auth/admin-login.component').then(m => m.AdminLoginComponent),
  },
  {
    path: 'admin',
''')
routes_path.write_text(routes)

controller_path = root / 'server/src/auth/auth.controller.ts'
controller = controller_path.read_text()
controller = replace_once(controller, '    const frontendUrl = this.configService.frontendUrl;', '''    const frontendUrl = this.configService.frontendUrl;
    // OAuth belongs to the staff console, not the public homepage. These are
    // fixed local paths; no user-supplied return URL can become an open redirect.
    const loginUrl = new URL('/admin/login', frontendUrl).toString();
    const dashboardUrl = new URL('/admin/dashboard', frontendUrl).toString();''')
controller = replace_once(controller, '`${frontendUrl}?error=${encodeURIComponent(error || \'missing_code\')}`', '`${loginUrl}?error=${encodeURIComponent(error || \'missing_code\')}`')
controller = replace_once(controller, '`${frontendUrl}?token=${encodeURIComponent(token)}`', '`${dashboardUrl}?token=${encodeURIComponent(token)}`')
controller = replace_once(controller, '`${frontendUrl}?error=auth_failed`', '`${loginUrl}?error=auth_failed`')
controller_path.write_text(controller)

ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text()
ci = replace_once(ci, '          node ryvl-discord-bot/web/test/ui-review-regressions.cjs', '          node ryvl-discord-bot/web/test/ui-review-regressions.cjs\n          node ryvl-discord-bot/web/test/admin-access.cjs')
ci_path.write_text(ci)
print('Prepared focused admin entry, session recovery and OAuth return fix; backend authorization and domain configuration unchanged.')
