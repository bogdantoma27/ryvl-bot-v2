import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
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
        <!-- Authenticated Admin Layout: Sidebar + Main Workspace -->
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
                    Admin Console
                  </div>
                </div>
              </div>

              <!-- Server Switcher Dropdown (Always visible) -->
              <div class="mt-3 pt-3 border-t border-slate-800">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Select Server</span>
                  <button
                    type="button"
                    (click)="onRefreshGuilds()"
                    [disabled]="isRefreshingGuilds()"
                    class="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                    title="Refresh list of Discord servers where you are admin"
                  >
                    <svg class="w-3 h-3" [class.animate-spin]="isRefreshingGuilds()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{{ isRefreshingGuilds() ? 'Syncing...' : 'Sync' }}</span>
                  </button>
                </div>

                <div class="relative">
                  <select
                    [ngModel]="guildStore.activeGuildId()"
                    (ngModelChange)="onGuildSelectChange($event)"
                    class="w-full bg-[#11192e] border border-slate-700/80 hover:border-slate-600 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#5865F2] transition cursor-pointer appearance-none pr-8"
                  >
                    @for (g of guildStore.availableGuilds(); track g.id) {
                      <option [value]="g.id" [selected]="g.id === guildStore.activeGuildId()">
                        {{ g.name }}
                      </option>
                    }
                    @if (guildStore.availableGuilds().length === 0) {
                      <option [value]="guildStore.activeGuildId()">{{ guildName() }}</option>
                    }
                  </select>
                  <div class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                @if (guildStore.availableGuilds().length > 1) {
                  <p class="text-[10px] text-slate-400 mt-1">
                    Managing {{ guildStore.availableGuilds().length }} servers with admin access.
                  </p>
                } @else {
                  <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>1 server connected</span>
                    <a
                      href="https://discord.com/oauth2/authorize?client_id=1503459239610290318&permissions=8&scope=bot%20applications.commands"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                    >
                      + Add to Server
                    </a>
                  </div>
                }
              </div>
            </div>

            <!-- Middle Section: Categorized Navigation Links -->
            <nav class="flex-1 p-3 space-y-4 overflow-y-auto text-xs">
              <!-- SERVER MANAGEMENT -->
              <div class="space-y-1">
                <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Server Management
                </div>
                <a
                  routerLink="/admin/dashboard"
                  routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span>Dashboard</span>
                </a>

                <a
                  routerLink="/admin/events"
                  routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Events</span>
                </a>

                <a
                  routerLink="/admin/lineup"
                  routerLinkActive="!bg-[#EAE905] !text-black font-bold shadow-md shadow-yellow-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Lineup</span>
                </a>

                <a
                  routerLink="/admin/settings"
                  routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </a>
              </div>

              <!-- CLUB TRACKING & STATS -->
              <div class="space-y-1">
                <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Club Tracking & Stats
                </div>
                <a
                  routerLink="/admin/club"
                  routerLinkActive="!bg-[#00d26a] !text-black font-bold shadow-md shadow-emerald-500/20 [&>svg]:!text-black"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                  <span>Club Tracker</span>
                </a>
              </div>

              <!-- VPG COMPETITIONS -->
              <div class="space-y-1">
                <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  VPG Competitions
                </div>
                <a
                  routerLink="/admin/transfers"
                  routerLinkActive="!bg-[#1f8b4c] !text-white font-bold shadow-md shadow-emerald-500/20 [&>svg]:!text-white"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>VPG Transfers</span>
                </a>

                <a
                  routerLink="/admin/totw"
                  routerLinkActive="!bg-gradient-to-r !from-amber-500 !to-yellow-500 !text-black font-bold shadow-md shadow-amber-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <span class="text-sm">⭐</span>
                  <span>Team of the Week</span>
                </a>

                <a
                  routerLink="/admin/superliga-mvp"
                  routerLinkActive="!bg-gradient-to-r !from-amber-500 !to-yellow-500 !text-black font-bold shadow-md shadow-amber-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <span class="text-sm">🏅</span>
                  <span>Superliga MVP</span>
                </a>
              </div>

              <!-- TOURNAMENTS -->
              <div class="space-y-1">
                <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Tournaments
                </div>
                <a
                  routerLink="/admin/tournaments"
                  routerLinkActive="!bg-[#5865F2] !text-white font-bold shadow-md shadow-indigo-500/20"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <span class="text-sm">🏆</span>
                  <span>Tournaments & FC Draft</span>
                </a>
              </div>

              <!-- BOT DOCUMENTATION -->
              <div class="space-y-1">
                <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Resources
                </div>
                <a
                  routerLink="/docs"
                  routerLinkActive="!bg-indigo-600/30 !text-white font-bold"
                  (click)="closeMobileSidebar()"
                  class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-300 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                >
                  <span class="text-sm">📖</span>
                  <span>Bot Documentation</span>
                </a>
              </div>

              <!-- OFFICIAL RYVL ESPORTS (shown ONLY if active guild is RYVL) -->
              @if (isRyvlGuild()) {
                <div class="space-y-1">
                  <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#EAE905]">
                    Official RYVL Esports
                  </div>
                  <a
                    routerLink="/admin/performance"
                    routerLinkActive="!bg-[#EAE905] !text-black font-bold shadow-md shadow-yellow-500/20"
                    (click)="closeMobileSidebar()"
                    class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-slate-200 hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                  >
                    <span class="text-sm">⚡</span>
                    <span>RYVL Performance</span>
                  </a>

                  @if (isBotSubdomain()) {
                    <a
                      href="https://ryvl.top"
                      (click)="closeMobileSidebar()"
                      class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-[#EAE905] hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                    >
                      <span class="text-sm">🌐</span>
                      <span>Public RYVL Site</span>
                    </a>
                  } @else {
                    <a
                      routerLink="/"
                      (click)="closeMobileSidebar()"
                      class="flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-[#EAE905] hover:text-white hover:bg-[#1f2e54] transition cursor-pointer"
                    >
                      <span class="text-sm">🌐</span>
                      <span>Public RYVL Site</span>
                    </a>
                  }
                </div>
              }
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
            <!-- Mobile Header with Hamburger Button & Socials -->
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

              <div class="flex items-center gap-2">
                <select
                  [ngModel]="guildStore.activeGuildId()"
                  (ngModelChange)="onGuildSelectChange($event)"
                  class="bg-[#11192e] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white max-w-[130px] truncate focus:outline-none focus:border-[#5865F2] cursor-pointer"
                >
                  @for (g of guildStore.availableGuilds(); track g.id) {
                    <option [value]="g.id" [selected]="g.id === guildStore.activeGuildId()">{{ g.name }}</option>
                  }
                  @if (guildStore.availableGuilds().length === 0) {
                    <option [value]="guildStore.activeGuildId()">{{ guildName() }}</option>
                  }
                </select>
                <a
                  routerLink="/docs"
                  class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-xs hover:bg-indigo-500/20 transition"
                  title="Documentation"
                >
                  📖
                </a>
                <div class="w-7 h-7 rounded-full bg-[#5865F2] flex items-center justify-center text-white text-xs font-bold">
                  {{ userInitial() }}
                </div>
              </div>
            </header>

            <!-- Desktop Header Bar with Server Selector & Documentation -->
            <header class="hidden md:flex items-center justify-between px-8 py-3.5 bg-[#16213e]/80 backdrop-blur border-b border-slate-800 sticky top-0 z-20">
              <div class="flex items-center gap-3">
                <span class="text-xs uppercase font-extrabold tracking-wider text-slate-400">{{ guildName() }}</span>
                <span class="text-slate-600">/</span>
                <span class="text-xs font-semibold text-slate-200">Management Console</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Server:</span>
                  <div class="relative">
                    <select
                      [ngModel]="guildStore.activeGuildId()"
                      (ngModelChange)="onGuildSelectChange($event)"
                      class="bg-[#11192e] border border-slate-700 hover:border-slate-500 rounded-xl pl-3 pr-7 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-[#5865F2] transition cursor-pointer appearance-none"
                    >
                      @for (g of guildStore.availableGuilds(); track g.id) {
                        <option [value]="g.id" [selected]="g.id === guildStore.activeGuildId()">{{ g.name }}</option>
                      }
                      @if (guildStore.availableGuilds().length === 0) {
                        <option [value]="guildStore.activeGuildId()">{{ guildName() }}</option>
                      }
                    </select>
                    <div class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button
                    type="button"
                    (click)="onRefreshGuilds()"
                    [disabled]="isRefreshingGuilds()"
                    class="p-1.5 rounded-lg bg-[#11192e] border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Refresh server list"
                  >
                    <svg class="w-3.5 h-3.5" [class.animate-spin]="isRefreshingGuilds()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <a
                  routerLink="/docs"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition cursor-pointer"
                  title="Bot Command Documentation"
                >
                  <span>📖</span>
                  <span>Documentation</span>
                </a>
              </div>
            </header>

            <!-- Router Content Outlet (Uniform Max Width) -->
            <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              <router-outlet />
            </main>
          </div>
        </div>
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
  readonly isMobileSidebarOpen = signal<boolean>(false);
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

  readonly guildName = computed(() => this.guildStore.activeGuild()?.name || 'RYVL Discord Server');
  readonly guildIcon = computed(() => this.guildStore.activeGuild()?.iconUrl || null);

  readonly guildInitials = computed(() => {
    const name = this.guildName();
    if (!name) return 'RY';
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

  readonly isBotSubdomain = computed(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.startsWith('bot.');
  });

  readonly isRyvlGuild = computed(() => {
    const g = this.guildStore.activeGuild();
    if (!g) return false;
    const name = (g.name || '').toLowerCase();
    return name.includes('ryvl');
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

  readonly isRefreshingGuilds = signal<boolean>(false);

  async onRefreshGuilds(): Promise<void> {
    this.isRefreshingGuilds.set(true);
    try {
      await this.guildStore.loadGuilds();
    } finally {
      this.isRefreshingGuilds.set(false);
    }
  }

  async onGuildSelectChange(guildId: string): Promise<void> {
    if (guildId && guildId !== this.guildStore.activeGuildId()) {
      await this.guildStore.setActiveGuild(guildId);
      const currentUrl = this.router.url.split('?')[0];
      await this.router.navigate([currentUrl], {
        queryParams: { guildId },
        queryParamsHandling: 'merge',
      });
    }
  }

  toggleMobileSidebar(): void {
    this.isMobileSidebarOpen.set(!this.isMobileSidebarOpen());
  }

  closeMobileSidebar(): void {
    this.isMobileSidebarOpen.set(false);
  }
}
