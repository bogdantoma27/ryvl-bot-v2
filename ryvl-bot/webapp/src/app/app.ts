import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ApiService, AuthState } from './core/api.service';
import { SnackbarService } from './core/snackbar.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100">
      <div class="mx-auto max-w-6xl px-4 py-6">
        <header class="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div class="flex items-start justify-between gap-3 lg:items-center">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">RYVL BOT</p>
              <h1 class="text-xl font-semibold">Control Panel</h1>
              @if (authState()) {
                <p class="mt-1 text-xs text-slate-400">Signed in as {{ displayUserLabel(authState()!.user) }}</p>
              }
            </div>

            @if (isAuthenticated()) {
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-300 lg:hidden"
                (click)="toggleMobileMenu()"
                [attr.aria-expanded]="mobileMenuOpen()"
                aria-label="Toggle navigation menu"
              >
                <span class="space-y-1.5">
                  <span class="block h-0.5 w-5 rounded-full bg-current"></span>
                  <span class="block h-0.5 w-5 rounded-full bg-current"></span>
                  <span class="block h-0.5 w-5 rounded-full bg-current"></span>
                </span>
              </button>

              <div class="hidden lg:flex lg:items-center lg:justify-end lg:gap-2">
                <nav class="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 text-sm lg:flex-wrap lg:overflow-visible lg:pb-0">
                  @for (tab of tabs; track tab.path) {
                    <a
                      class="shrink-0 snap-start rounded-lg border border-slate-700 px-3 py-1.5 whitespace-nowrap transition hover:border-emerald-400/60 hover:text-emerald-300"
                      [routerLink]="tab.path"
                      routerLinkActive="border-emerald-400 bg-emerald-400/10 text-emerald-300"
                    >
                      {{ tab.label }}
                    </a>
                  }
                </nav>

                <button class="shrink-0 rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20" (click)="logout()">Logout</button>
              </div>
            }
          </div>

          @if (isAuthenticated() && mobileMenuOpen()) {
            <div class="mt-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 lg:hidden">
              <nav class="grid gap-2 text-sm">
                @for (tab of tabs; track tab.path) {
                  <a
                    class="rounded-lg border border-slate-700 px-3 py-2 transition hover:border-emerald-400/60 hover:text-emerald-300"
                    [routerLink]="tab.path"
                    (click)="closeMobileMenu()"
                    routerLinkActive="border-emerald-400 bg-emerald-400/10 text-emerald-300"
                  >
                    {{ tab.label }}
                  </a>
                }
                <button class="rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-left font-semibold text-rose-200 transition hover:bg-rose-500/20" (click)="logout()">Logout</button>
              </nav>
            </div>
          }
        </header>

        <main>
          @if (isAuthenticated()) {
            <div class="touch-pan-y" (touchstart)="handleSwipeStart($event)" (touchend)="handleSwipeEnd($event)">
              <router-outlet />
            </div>
          } @else {
            <section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
              <p class="mb-2 text-sm text-slate-300">Sign in to Discord to access this admin panel and manage attendance, lineup, and bot settings.</p>
              <a class="mx-auto mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-8 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-400" [href]="loginUrl()">Sign in to Discord</a>
            </section>
          }
        </main>

        @if (snackbars().length) {
          <div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
            <div class="pointer-events-auto flex w-full max-w-md flex-col gap-2">
              @for (note of snackbars(); track note.id) {
                <div
                  class="rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur"
                  [class.border-emerald-500/40]="note.kind === 'success'"
                  [class.bg-emerald-500/15]="note.kind === 'success'"
                  [class.text-emerald-100]="note.kind === 'success'"
                  [class.border-rose-500/40]="note.kind === 'error'"
                  [class.bg-rose-500/15]="note.kind === 'error'"
                  [class.text-rose-100]="note.kind === 'error'"
                  [class.border-sky-500/40]="note.kind === 'info'"
                  [class.bg-sky-500/15]="note.kind === 'info'"
                  [class.text-sky-100]="note.kind === 'info'"
                >
                  <div class="flex items-start justify-between gap-3">
                    <p class="pr-2">{{ note.message }}</p>
                    <button type="button" class="text-xs text-slate-300 transition hover:text-white" (click)="dismissSnackbar(note.id)">Dismiss</button>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [],
})
export class App implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private swipeStartX = 0;
  private swipeStartY = 0;

  protected readonly tabs = [
    { path: '/attendance', label: 'Attendance' },
    { path: '/lineup', label: 'Lineup' },
    { path: '/settings', label: 'Settings' },
    { path: '/diagnostics', label: 'Diagnostics' },
  ];

  protected readonly authState = signal<AuthState | null>(null);
  protected readonly isAuthenticated = signal(false);
  protected readonly loginUrl = signal('');
  protected readonly mobileMenuOpen = signal(false);
  protected readonly snackbars = this.snackbar.snackbars;

  protected displayUserLabel(user: AuthState['user']): string {
    const discriminator = String(user.discriminator || '').trim();
    if (!discriminator || discriminator === '0') return user.username;
    return `${user.username}#${discriminator}`;
  }

  private buildReturnTo(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    const url = new URL(window.location.href);
    url.searchParams.delete('return_to');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    return url.toString();
  }

  private consumeAuthErrorFromUrl(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const error = String(url.searchParams.get('auth_error') || url.searchParams.get('error') || '').trim();
    const description = String(url.searchParams.get('auth_error_description') || url.searchParams.get('error_description') || '').trim();
    if (!error && !description) return;

    const message = description || error || 'Discord sign-in failed.';
    this.snackbar.error(`Sign in failed: ${message}`);

    url.searchParams.delete('auth_error');
    url.searchParams.delete('auth_error_description');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    url.searchParams.delete('return_to');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());
  }

  async ngOnInit(): Promise<void> {
    this.consumeAuthErrorFromUrl();
    const returnTo = this.buildReturnTo();
    this.loginUrl.set(this.api.getDiscordLoginUrl(returnTo));

    try {
      const me = await this.api.authMe();
      this.authState.set(me);
      this.isAuthenticated.set(Boolean(me?.authenticated));
      if (me?.authenticated && typeof window !== 'undefined' && window.location.pathname === '/') {
        await this.router.navigateByUrl('/attendance');
      }
    } catch {
      this.authState.set(null);
      this.isAuthenticated.set(false);
    }
  }

  protected async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.mobileMenuOpen.set(false);
      this.authState.set(null);
      this.isAuthenticated.set(false);
      const returnTo = this.buildReturnTo();
      this.loginUrl.set(this.api.getDiscordLoginUrl(returnTo));
    }
  }

  protected handleSwipeStart(event: TouchEvent): void {
    if (this.mobileMenuOpen()) {
      this.mobileMenuOpen.set(false);
      return;
    }
    const touch = event.changedTouches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
  }

  protected async handleSwipeEnd(event: TouchEvent): Promise<void> {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    const currentPath = this.router.url.split('?')[0].split('#')[0];
    const currentIndex = this.tabs.findIndex(tab => tab.path === currentPath);
    if (currentIndex < 0) return;

    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextTab = this.tabs[nextIndex];
    if (nextTab) {
      this.mobileMenuOpen.set(false);
      await this.router.navigateByUrl(nextTab.path);
    }
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update(value => !value);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected dismissSnackbar(id: number): void {
    this.snackbar.dismiss(id);
  }
}
