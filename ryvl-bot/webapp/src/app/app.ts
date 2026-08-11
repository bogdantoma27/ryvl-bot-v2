import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ApiService, AuthState } from './core/api.service';
import { DraftCountsService } from './core/draft-counts.service';
import { SnackbarService } from './core/snackbar.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-shell">
      @if (isAuthenticated()) {
        <aside class="app-sidebar" [class.is-open]="mobileMenuOpen()">
          <div class="sidebar-brand">
            <span class="brand-mark">
              @if (guildIconUrl()) {
                <img [src]="guildIconUrl()" alt="" />
              } @else {
                <img [src]="brandIconUrl" alt="RYVL" />
              }
            </span>
            <div><strong>{{ guildName() }}</strong></div>
            <button type="button" class="sidebar-close" (click)="closeMobileMenu()" aria-label="Close navigation">×</button>
          </div>

          <nav class="sidebar-nav" aria-label="Primary navigation">
            <p class="sidebar-label">Workspace</p>
            <a class="sidebar-link sidebar-parent" routerLink="/events" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }"><span>▣</span> Events</a>
            <a class="sidebar-link sidebar-child" routerLink="/events/drafts" routerLinkActive="is-active">Drafts @if (draftCounts.eventDrafts() > 0) { <span class="sidebar-count">{{ draftCounts.eventDrafts() }}</span> }</a>
            <a class="sidebar-link sidebar-child" routerLink="/events/recurring" routerLinkActive="is-active">Recurring</a>
            <a class="sidebar-link sidebar-child" routerLink="/events/scheduled" routerLinkActive="is-active">Scheduled</a>
            <a class="sidebar-link sidebar-parent" routerLink="/lineup" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }"><span>◆</span> Lineup</a>
            <a class="sidebar-link sidebar-child" routerLink="/lineup/drafts" routerLinkActive="is-active">Drafts @if (draftCounts.lineupDrafts() > 0) { <span class="sidebar-count">{{ draftCounts.lineupDrafts() }}</span> }</a>
            <a class="sidebar-link sidebar-parent" routerLink="/vpg" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }"><span>⚽</span> League centre</a>
            <a class="sidebar-link sidebar-child" routerLink="/vpg/schedules" routerLinkActive="is-active">Schedules</a>
            <a class="sidebar-link sidebar-child" routerLink="/vpg/transfers" routerLinkActive="is-active">Transfers</a>
            <p class="sidebar-label sidebar-label-spaced">Account</p>
            <a class="sidebar-link" routerLink="/settings" routerLinkActive="is-active"><span>⚙</span> Account</a>
          </nav>

          <div class="sidebar-footer" [class.menu-open]="profileMenuOpen()">
            @if (profileMenuOpen()) {
              <div class="profile-menu">
                <a class="profile-menu-item" routerLink="/settings" (click)="closeProfileMenu()"><span>⚙</span> Account</a>
                <button type="button" class="profile-menu-item profile-menu-danger" (click)="logout()"><span>⏻</span> Sign out</button>
              </div>
            }
            <button type="button" class="profile-button" (click)="toggleProfileMenu()" [attr.aria-expanded]="profileMenuOpen()">
              @if (profileAvatarUrl()) {
                <img class="profile-avatar profile-avatar-image" [src]="profileAvatarUrl()" alt="" />
              } @else {
                <span class="profile-avatar">{{ profileInitial() }}</span>
              }
              <span class="profile-copy"><strong>{{ profileName() }}</strong><small>{{ profileTag() }}</small></span>
              <span>⋯</span>
            </button>
          </div>
        </aside>
        @if (profileMenuOpen()) {
          <div class="profile-menu-backdrop" (click)="closeProfileMenu()"></div>
        }
        <button type="button" class="mobile-menu-button" (click)="toggleMobileMenu()" aria-label="Open navigation">☰</button>
      }

      <main class="app-main" [class.app-main-full]="!isAuthenticated()">
          @if (isAuthenticated()) {
            <div class="touch-pan-y" (touchstart)="handleSwipeStart($event)" (touchend)="handleSwipeEnd($event)">
              <router-outlet />
            </div>
          } @else {
            <section class="signed-out-card">
              <img class="signed-out-mark signed-out-mark-image" [src]="guildIconUrl() || brandIconUrl" alt="RYVL" />
              <h1>{{ guildName() }}</h1>
              <p>Sign in with Discord to manage events, lineups, and posting settings for your server.</p>
              <a class="primary-action" [href]="loginUrl()">Sign in with Discord</a>
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
  `,
  styles: [],
})
export class App implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  protected readonly theme = inject(ThemeService);
  protected readonly draftCounts = inject(DraftCountsService);
  private swipeStartX = 0;
  private swipeStartY = 0;

  protected readonly tabs = [
    { path: '/events', label: 'Events' },
    { path: '/lineup', label: 'Lineup' },
    { path: '/settings', label: 'Account' },
  ];

  protected readonly authState = signal<AuthState | null>(null);
  protected readonly isAuthenticated = signal(false);
  protected readonly loginUrl = signal('');
  protected readonly mobileMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly snackbars = this.snackbar.snackbars;
  protected readonly guildIconUrl = signal<string | null>(null);
  protected readonly guildName = signal('RYVL Esports');
  protected readonly brandIconUrl = '/guild-icon.png';

  protected profileName(): string {
    const user = this.authState()?.user;
    return user?.global_name?.trim() || user?.username || 'Discord user';
  }

  protected profileTag(): string {
    const user = this.authState()?.user;
    return `@${user?.username || 'discord-user'}`;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.profileMenuOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.sidebar-footer')) return;
    this.closeProfileMenu();
  }

  private async loadPublicGuildInfo(): Promise<void> {
    try {
      const info = await this.api.getPublicGuildInfo();
      this.guildIconUrl.set(info.guild_icon_url);
      this.guildName.set(info.guild_name || 'RYVL Esports');
      this.updateFavicon(info.guild_icon_url);
    } catch {
      // Guild info is a nice-to-have on the sign-in screen; ignore failures.
    }
  }

  private updateFavicon(iconUrl: string | null): void {
    if (typeof document === 'undefined' || !iconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = iconUrl;
  }

  protected profileInitial(): string {
    return this.profileName().slice(0, 1).toUpperCase();
  }

  protected profileAvatarUrl(): string | null {
    const user = this.authState()?.user;
    if (!user?.avatar) return null;
    const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=64`;
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update(value => !value);
  }

  protected closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

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
    url.searchParams.delete('session_token');
    return url.toString();
  }

  private consumeSessionTokenFromUrl(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const sessionToken = String(url.searchParams.get('session_token') || '').trim();
    if (!sessionToken) return;

    this.api.setSessionToken(sessionToken);
    url.searchParams.delete('session_token');
    window.history.replaceState({}, '', url.toString());
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
    url.searchParams.delete('session_token');
    window.history.replaceState({}, '', url.toString());
  }

  async ngOnInit(): Promise<void> {
    this.consumeSessionTokenFromUrl();
    this.consumeAuthErrorFromUrl();
    const returnTo = this.buildReturnTo();
    this.loginUrl.set(this.api.getDiscordLoginUrl(returnTo));

    try {
      const me = await this.api.authMe();
      this.authState.set(me);
      this.isAuthenticated.set(Boolean(me?.authenticated));
      if (me?.authenticated) {
        void this.draftCounts.refresh();
        try {
          const bootstrap = await this.api.getBootstrap();
          this.guildIconUrl.set(bootstrap.guild_icon_url);
          this.guildName.set(bootstrap.guild_name || 'RYVL Esports');
          this.updateFavicon(bootstrap.guild_icon_url);
        } catch {
          this.guildIconUrl.set(null);
        }
      } else {
        void this.loadPublicGuildInfo();
      }
      if (me?.authenticated && typeof window !== 'undefined' && window.location.pathname === '/') {
        await this.router.navigateByUrl('/events');
      }
    } catch {
      this.authState.set(null);
      this.isAuthenticated.set(false);
      void this.loadPublicGuildInfo();
    }

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      if (this.isAuthenticated()) void this.draftCounts.refresh();
    });
  }

  protected async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.mobileMenuOpen.set(false);
      this.profileMenuOpen.set(false);
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
