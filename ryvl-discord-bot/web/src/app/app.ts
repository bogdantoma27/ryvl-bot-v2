import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet, NavigationEnd } from '@angular/router';
import { ApiService } from './core/api.service';
import { GuildStore } from './core/guild.store';
import { User } from './core/models';
import { AdminShellComponent } from './features/admin-shell/admin-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, AdminShellComponent],
  template: `
    @if (!isAdminRoute() || isLoginRoute()) {
      <!-- Public Website: Router outlet handled inside PublicShellComponent -->
      <router-outlet />
    } @else {
      <!-- Admin Console Routes (/admin/...) -->
      @if (isAuthChecking()) {
        <div class="min-h-screen bg-[#0d0d0e] flex flex-col items-center justify-center text-slate-300">
          <div class="w-12 h-12 rounded-2xl bg-[#EAE905] flex items-center justify-center shadow-lg shadow-[#EAE905]/30 animate-pulse mb-4">
            <img src="/assets/branding/ryvl-logo.png" alt="RYVL" class="w-7 h-7 object-contain" />
          </div>
          <p class="text-sm font-medium tracking-wide">Initializing RYVL Admin Console...</p>
        </div>
      } @else if (!isAuthenticated()) {
        <!-- A protected view never mounts before authentication completes. -->
        <div class="min-h-screen flex items-center justify-center bg-[#080808] text-slate-200">
          <a routerLink="/admin/login" class="public-button">Go to staff sign-in</a>
        </div>
      } @else {
        <!-- Authenticated admin layout, loaded on demand (keeps it out of the public bundle) -->
        @defer {
          <app-admin-shell [user]="currentUser()" (logout)="logout()" />
        } @placeholder {
          <div class="min-h-screen bg-[#1a1a2e]"></div>
        }
      }
    }
  `,
  styles: ``,
})
export class App implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly guildStore = inject(GuildStore);

  readonly isAuthenticated = signal<boolean>(false);
  readonly isAuthChecking = signal<boolean>(true);
  readonly currentUser = signal<User | null>(null);

  readonly currentPath = signal<string>(
    typeof window !== 'undefined' ? window.location.pathname : '',
  );

  readonly isAdminRoute = computed(() => /^\/admin(?:\/|[?#]|$)/.test(this.currentPath()));
  readonly isLoginRoute = computed(() => this.currentPath().split(/[?#]/, 1)[0] === '/admin/login');
  private authCheckVersion = 0;

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentPath.set(event.urlAfterRedirects || event.url);
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
        }
      }
    });
  }

  readonly isBotSubdomain = computed(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.startsWith('bot.');
  });

  async ngOnInit(): Promise<void> {
    if (typeof window !== 'undefined' && window.location.hostname.startsWith('bot.')) {
      if (window.location.pathname === '/' || window.location.pathname === '') {
        await this.router.navigate(['/admin/dashboard'], { replaceUrl: true });
      }
    }
    await this.checkAuth();
  }

  async checkAuth(): Promise<void> {
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

  logout(): void {
    this.api.setSessionToken(null);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    if (this.isBotSubdomain()) {
      this.router.navigate(['/admin/login']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
