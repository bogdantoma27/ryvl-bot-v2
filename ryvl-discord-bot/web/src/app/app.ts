import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from './core/api.service';
import { GuildStore } from './core/guild.store';
import { User } from './core/models';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (isAuthChecking()) {
      <div class="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center text-slate-300">
        <div class="w-12 h-12 rounded-2xl bg-[#5865F2] flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse mb-4">
          <svg class="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
          </svg>
        </div>
        <p class="text-sm font-medium tracking-wide">Initializing RYVL Console...</p>
      </div>
    } @else if (!isAuthenticated()) {
      <!-- Unauthenticated State: Centered Login Page -->
      <div class="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4 relative overflow-hidden">
        <!-- Ambient background gradients -->
        <div class="absolute -top-40 -left-40 w-96 h-96 bg-[#5865F2]/15 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-[#0f3460]/30 rounded-full blur-3xl pointer-events-none"></div>

        <div class="w-full max-w-md bg-[#16213e] border border-slate-700/80 rounded-2xl p-8 shadow-2xl relative z-10 text-center space-y-6">
          <!-- Logo & Brand -->
          <div class="space-y-3">
            <div class="w-16 h-16 rounded-2xl bg-[#5865F2] mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg class="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
              </svg>
            </div>
            <h1 class="text-2xl font-black text-white tracking-tight">RYVL DISCORD BOT</h1>
            <p class="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Automated community events, interactive RSVP tracking, and competitive match lineups.
            </p>
          </div>

          <!-- Login Button -->
          <div class="space-y-3 pt-2">
            <button
              type="button"
              (click)="loginWithDiscord()"
              class="w-full inline-flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition duration-150 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <svg class="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
              </svg>
              <span>Login with Discord</span>
            </button>
          </div>

          <div class="pt-2 text-[11px] text-slate-500">
            Requires server administrator or designated manager permissions.
          </div>
        </div>
      </div>
    } @else {
      <!-- Authenticated Layout: Fixed Dark Sidebar + Main Viewport -->
      <div class="min-h-screen bg-[#1a1a2e] text-[#dcddde] flex">
        <!-- Mobile Backdrop -->
        @if (isMobileSidebarOpen()) {
          <div
            (click)="toggleMobileSidebar()"
            class="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
          ></div>
        }

        <!-- Dark Sidebar (260px wide, fixed on desktop, slide-in on mobile) -->
        <aside
          class="fixed top-0 bottom-0 left-0 w-[260px] bg-[#16213e] border-r border-slate-800 z-40 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0"
          [class.translate-x-0]="isMobileSidebarOpen()"
          [class.-translate-x-full]="!isMobileSidebarOpen()"
        >
          <!-- Top Section: Guild Brand -->
          <div class="p-5 border-b border-slate-800">
            <div class="flex items-center gap-3">
              @if (guildIcon()) {
                <img
                  [src]="guildIcon()!"
                  alt="Guild Icon"
                  class="w-10 h-10 rounded-xl object-cover border border-[#5865F2]"
                />
              } @else {
                <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5865F2] to-[#4752C4] flex items-center justify-center text-white text-sm font-black shadow-md shrink-0">
                  {{ guildInitials() }}
                </div>
              }

              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white truncate">{{ guildName() }}</div>
                <div class="text-[11px] text-emerald-400 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Active Guild
                </div>
              </div>
            </div>

            @if (guildStore.availableGuilds().length > 1) {
              <div class="mt-3">
                <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Switch Server</label>
                <select
                  [ngModel]="guildStore.activeGuildId()"
                  (ngModelChange)="onGuildSelectChange($event)"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#5865F2] transition cursor-pointer"
                >
                  @for (g of guildStore.availableGuilds(); track g.id) {
                    <option [value]="g.id" [selected]="g.id === guildStore.activeGuildId()">{{ g.name }}</option>
                  }
                </select>
              </div>
            }
          </div>

          <!-- Middle Section: Navigation Links -->
          <nav class="flex-1 p-4 space-y-1.5 overflow-y-auto">
            <a
              routerLink="/dashboard"
              routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
              (click)="closeMobileSidebar()"
              class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </a>

            <a
              routerLink="/events"
              routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
              (click)="closeMobileSidebar()"
              class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Events</span>
            </a>

            <a
              routerLink="/settings"
              routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
              (click)="closeMobileSidebar()"
              class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </a>
          </nav>

          <!-- Bottom Section: User Avatar, Name, Logout -->
          <div class="p-4 border-t border-slate-800 bg-[#11192e]">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                @if (userAvatar()) {
                  <img [src]="userAvatar()!" alt="Avatar" class="w-8 h-8 rounded-full border border-slate-600 object-cover" />
                } @else {
                  <div class="w-8 h-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-bold shrink-0">
                    {{ userInitial() }}
                  </div>
                }

                <div class="min-w-0">
                  <div class="text-xs font-semibold text-white truncate">{{ userName() }}</div>
                  <div class="text-[10px] text-slate-500 truncate">Administrator</div>
                </div>
              </div>

              <button
                type="button"
                (click)="logout()"
                title="Logout"
                class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        <!-- Main Workspace Area (Desktop offset by 260px) -->
        <div class="flex-1 md:pl-[260px] flex flex-col min-h-screen">
          <!-- Mobile Header with Hamburger Button -->
          <header class="md:hidden flex items-center justify-between px-4 py-3 bg-[#16213e] border-b border-slate-800 sticky top-0 z-20">
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="toggleMobileSidebar()"
                class="p-2 rounded-lg bg-[#1a1a2e] text-slate-300 hover:text-white focus:outline-none"
                aria-label="Toggle menu"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span class="text-sm font-bold text-white truncate">{{ guildName() }}</span>
            </div>

            <div class="w-7 h-7 rounded-full bg-[#5865F2] flex items-center justify-center text-white text-xs font-bold">
              {{ userInitial() }}
            </div>
          </header>

          <!-- Router Content Outlet -->
          <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <router-outlet />
          </main>
        </div>
      </div>
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
  readonly isMobileSidebarOpen = signal<boolean>(false);
  readonly currentUser = signal<User | null>(null);

  readonly guildName = computed(() => this.guildStore.activeGuild()?.name || 'RYVL Discord Server');
  readonly guildIcon = computed(() => this.guildStore.activeGuild()?.iconUrl || null);

  readonly guildInitials = computed(() => {
    const name = this.guildName();
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  });

  readonly userName = computed(() => {
    const user = this.currentUser();
    return user?.global_name || user?.username || 'Discord User';
  });

  readonly userAvatar = computed(() => {
    const user = this.currentUser();
    return user?.avatar_url || user?.avatar || null;
  });

  readonly userInitial = computed(() => {
    const name = this.userName();
    return name ? name.charAt(0).toUpperCase() : 'U';
  });

  ngOnInit(): void {
    this.processUrlTokenAndAuth();
  }

  async processUrlTokenAndAuth(): Promise<void> {
    const sessionToken = this.api.getSessionToken();
    if (sessionToken) {
      try {
        const auth = await this.api.authMe();
        if (auth && (auth.authenticated || auth.user)) {
          this.isAuthenticated.set(true);
          this.currentUser.set(auth.user || (auth as any));
        } else {
          this.isAuthenticated.set(false);
          this.currentUser.set(null);
          this.api.setSessionToken(null);
        }
      } catch (err: unknown) {
        console.error('Backend authMe verification failed:', err);
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
        this.api.setSessionToken(null);
      }
    } else {
      this.isAuthenticated.set(false);
    }

    this.isAuthChecking.set(false);

    if (this.isAuthenticated()) {
      await this.guildStore.loadGuilds();
    }
  }

  loginWithDiscord(): void {
    if (typeof window !== 'undefined') {
      window.location.href = this.api.getDiscordLoginUrl();
    }
  }

  logout(): void {
    this.api.setSessionToken(null);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/']);
  }

  toggleMobileSidebar(): void {
    this.isMobileSidebarOpen.set(!this.isMobileSidebarOpen());
  }

  closeMobileSidebar(): void {
    this.isMobileSidebarOpen.set(false);
  }

  onGuildSelectChange(guildId: string): void {
    if (guildId && guildId !== this.guildStore.activeGuildId()) {
      this.guildStore.setActiveGuild(guildId);
    }
  }

  onGuildChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target && target.value && target.value !== this.guildStore.activeGuildId()) {
      this.guildStore.setActiveGuild(target.value);
    }
  }
}
