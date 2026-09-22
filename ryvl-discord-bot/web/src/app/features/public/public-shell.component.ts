import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-public-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-[#080808] text-[#e0e0e0] flex flex-col font-sans selection:bg-[#EAE905] selection:text-black">
      <!-- Ambient Glows -->
      <div class="fixed top-0 left-1/4 w-[600px] h-[300px] bg-[#EAE905]/5 rounded-full blur-[140px] pointer-events-none z-0"></div>
      <div class="fixed bottom-0 right-10 w-[500px] h-[300px] bg-[#facc15]/5 rounded-full blur-[160px] pointer-events-none z-0"></div>

      <!-- Top Header Navbar -->
      <header class="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-md border-b border-[#EAE905]/15">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <!-- Brand Logo -->
          <a routerLink="/" class="flex items-center gap-3.5 group cursor-pointer">
            <div class="relative">
              <div class="absolute -inset-1 bg-[#EAE905] rounded-xl opacity-30 group-hover:opacity-75 blur transition duration-300"></div>
              <img
                src="/assets/branding/ryvl-logo.png"
                alt="RYVL Esports"
                class="relative h-11 w-11 object-contain transform group-hover:scale-105 transition"
              />
            </div>
            <div class="flex flex-col">
              <span class="text-xl font-black tracking-wider text-white flex items-center gap-1.5">
                RYVL <span class="text-[#EAE905] text-xs font-bold px-1.5 py-0.5 rounded bg-[#EAE905]/10 border border-[#EAE905]/30">ESPORTS</span>
              </span>
              <span class="text-[10px] tracking-[0.2em] text-slate-400 font-medium uppercase -mt-0.5">Rival The Best</span>
            </div>
          </a>

          <!-- Desktop Navigation -->
          <nav class="hidden xl:flex items-center gap-1">
            <a
              routerLink="/"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              [routerLinkActiveOptions]="{ exact: true }"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Home
            </a>
            <a
              routerLink="/team"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Team
            </a>
            <a
              routerLink="/competitions"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Competitions
            </a>
            <a
              routerLink="/results"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Results
            </a>
            <a
              routerLink="/fixtures"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Fixtures
            </a>
            <a
              routerLink="/standings"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Standings
            </a>
            <a
              routerLink="/live"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition flex items-center gap-1.5"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span>Live</span>
            </a>
            <a
              routerLink="/recruitment"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Recruitment
            </a>
            <a
              routerLink="/about"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              About
            </a>
            <a
              routerLink="/contact"
              routerLinkActive="!text-[#EAE905] !bg-[#EAE905]/10 !border-[#EAE905]/30"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-[#EAE905] hover:bg-white/5 border border-transparent transition"
            >
              Contact
            </a>
          </nav>

          <!-- Action Buttons -->
          <div class="hidden sm:flex items-center gap-3">
            <a
              href="https://discord.gg"
              target="_blank"
              rel="noopener noreferrer"
              class="px-3.5 py-2 rounded-lg bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/40 text-[#5865F2] hover:text-white text-xs font-bold tracking-wide uppercase transition flex items-center gap-2 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
              </svg>
              <span>Discord</span>
            </a>

            <a
              routerLink="/admin/dashboard"
              class="px-4 py-2 rounded-lg bg-[#EAE905] hover:bg-[#d4d304] text-black text-xs font-extrabold tracking-wide uppercase transition shadow-lg shadow-[#EAE905]/15 flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Admin Console</span>
            </a>
          </div>

          <!-- Mobile Hamburger -->
          <div class="flex xl:hidden items-center gap-2">
            <a
              routerLink="/admin/dashboard"
              class="px-3 py-1.5 rounded-lg bg-[#EAE905] text-black text-xs font-bold uppercase"
            >
              Admin
            </a>
            <button
              (click)="mobileNavOpen.set(!mobileNavOpen())"
              class="p-2 rounded-lg bg-white/5 border border-white/10 text-white"
              aria-label="Toggle Navigation"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Mobile Menu Dropdown -->
        @if (mobileNavOpen()) {
          <div class="xl:hidden bg-[#0a0a0a] border-b border-[#EAE905]/20 px-4 pt-2 pb-6 space-y-1">
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Home
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/team"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Team
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/competitions"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Competitions
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/results"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Results (VPG)
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/fixtures"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Fixtures
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/standings"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Standings
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/live"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-rose-400 hover:bg-white/5"
            >
              Live Match Center
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/recruitment"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Recruitment
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/about"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              About
            </a>
            <a
              (click)="mobileNavOpen.set(false)"
              routerLink="/contact"
              class="block px-3 py-2 rounded-lg text-sm font-bold uppercase text-slate-200 hover:text-[#EAE905] hover:bg-white/5"
            >
              Contact
            </a>
            <div class="pt-3 border-t border-slate-800 flex flex-col gap-2">
              <a
                href="https://discord.gg"
                target="_blank"
                class="w-full py-2.5 rounded-lg bg-[#5865F2] text-center text-xs font-bold text-white uppercase"
              >
                Join Official Discord
              </a>
            </div>
          </div>
        }
      </header>

      <!-- Main Public Viewport -->
      <main class="flex-1 w-full relative z-10">
        <router-outlet />
      </main>

      <!-- Cyber Organization Footer -->
      <footer class="bg-[#050505] border-t border-[#EAE905]/20 pt-16 pb-12 relative z-10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            <!-- Col 1: Brand & Slogan -->
            <div class="lg:col-span-2 space-y-4">
              <div class="flex items-center gap-3">
                <img src="/assets/branding/ryvl-logo.png" alt="RYVL" class="h-10 w-10 object-contain" />
                <span class="text-xl font-black text-white tracking-wider">RYVL ESPORTS</span>
              </div>
              <p class="text-xs text-slate-400 font-mono uppercase tracking-widest text-[#EAE905]">
                "WE CHALLENGE OURSELVES FIRST. THEN WE RIVAL THE BEST."
              </p>
              <p class="text-xs text-slate-400 leading-relaxed max-w-sm">
                Elite European Pro Clubs organization competing across VPG Superliga România and international 11v11 championships. Built on relentless execution and tactical discipline.
              </p>
              <div class="flex items-center gap-3 pt-1">
                <span class="text-xs font-bold text-slate-400">#WERYVL</span>
                <span class="text-slate-600">•</span>
                <span class="text-xs font-bold text-slate-400">DRIVEN. RELENTLESS. UNCOMPROMISING.</span>
              </div>
            </div>

            <!-- Col 2: Navigation -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-widest text-[#EAE905]">Organization</h4>
              <ul class="space-y-2 text-xs text-slate-400">
                <li><a routerLink="/" class="hover:text-white transition">Home</a></li>
                <li><a routerLink="/team" class="hover:text-white transition">Team Roster</a></li>
                <li><a routerLink="/about" class="hover:text-white transition">About RYVL</a></li>
                <li><a routerLink="/recruitment" class="hover:text-white transition">Trials & Recruitment</a></li>
                <li><a routerLink="/contact" class="hover:text-white transition">Contact Us</a></li>
              </ul>
            </div>

            <!-- Col 3: Competitions -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-widest text-[#EAE905]">Competitions</h4>
              <ul class="space-y-2 text-xs text-slate-400">
                <li><a routerLink="/results" class="hover:text-white transition">Superliga Results</a></li>
                <li><a routerLink="/fixtures" class="hover:text-white transition">Superliga Fixtures</a></li>
                <li><a routerLink="/standings" class="hover:text-white transition">League Table</a></li>
                <li><a routerLink="/competitions" class="hover:text-white transition">Tournaments</a></li>
                <li><a routerLink="/live" class="hover:text-white transition">Live Match Center</a></li>
              </ul>
            </div>

            <!-- Col 4: Portals & Community -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-widest text-[#EAE905]">Portals</h4>
              <ul class="space-y-2 text-xs text-slate-400">
                <li><a routerLink="/admin/dashboard" class="hover:text-[#EAE905] transition flex items-center gap-1.5"><span>🔒</span> Admin Console</a></li>
                <li><a routerLink="/club" class="hover:text-white transition">Club Tracker</a></li>
                <li><a routerLink="/transfers" class="hover:text-white transition">VPG Transfers</a></li>
                <li><a href="https://virtualprogaming.com" target="_blank" class="hover:text-white transition">Virtual Pro Gaming</a></li>
                <li><a href="https://discord.gg" target="_blank" class="hover:text-[#5865F2] transition">Official Discord Server</a></li>
              </ul>
            </div>
          </div>

          <!-- Bottom Copyright -->
          <div class="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <div>
              © 2026 RYVL Esports. All rights reserved. Powered by Virtual Pro Gaming România & RYVL Tech.
            </div>
            <div class="flex items-center gap-6">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <a routerLink="/admin/dashboard" class="hover:text-white">Staff Login</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  `,
})
export class PublicShellComponent {
  readonly mobileNavOpen = signal<boolean>(false);
}
