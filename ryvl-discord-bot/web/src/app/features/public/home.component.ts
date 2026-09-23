import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { VpgMatchItem } from '../../core/models';

@Component({
  selector: 'app-public-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-16 pb-12 overflow-hidden">
      <!-- Hero Section -->
      <section class="relative min-h-[70vh] flex items-center justify-center border-b border-[#EAE905]/15 px-4 sm:px-6 lg:px-8">
        <!-- Hero Background Artwork with Obsidian Gradient Overlays -->
        <div class="absolute inset-0 z-0">
          <img
            src="/assets/branding/ryvl-hero-tech.png"
            alt="RYVL Hero Backdrop"
            class="w-full h-full object-cover object-center opacity-30"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent"></div>
          <div class="absolute inset-0 bg-radial from-transparent via-[#080808]/60 to-[#080808]"></div>
        </div>

        <!-- Tech Grid Overlay -->
        <div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"></div>

        <!-- Hero Content -->
        <div class="max-w-5xl mx-auto text-center relative z-10 space-y-8 pt-12">


          <!-- Main Hero Headline -->
          <div class="space-y-2">
            <h1 class="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight uppercase leading-none">
              WE CHALLENGE <br />
              <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#EAE905] via-[#fff75a] to-[#FACC15]">
                OURSELVES FIRST.
              </span>
            </h1>
            <h2 class="text-3xl sm:text-5xl md:text-6xl font-black text-slate-300 tracking-tight uppercase">
              THEN WE RIVAL THE BEST.
            </h2>
          </div>

          <!-- Subtitle / Motto -->
          <p class="text-base sm:text-lg text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
            <span class="text-white font-bold tracking-wide">DRIVEN. RELENTLESS. UNCOMPROMISING.</span><br />
            EA SPORTS FC 27 11v11 Pro Clubs, competitive teamwork and a community that keeps improving.
          </p>

          <!-- Action Buttons -->
          <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
            <a
              routerLink="/performance"
              class="btn-yellow px-8 py-4 rounded-xl font-black text-sm uppercase tracking-wider transition duration-200 transform hover:-translate-y-0.5 shadow-xl shadow-[#EAE905]/20 flex items-center gap-2.5 cursor-pointer"
            >
              <span>RYVL Performance</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </a>

            <a
              routerLink="/match-center"
              class="px-7 py-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-sm uppercase tracking-wider transition duration-200 backdrop-blur-sm flex items-center gap-2.5 cursor-pointer"
            >
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>Match Center</span>
            </a>

            <a
              routerLink="/recruitment"
              class="px-7 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-bold text-sm uppercase tracking-wider transition duration-200 backdrop-blur-sm flex items-center gap-2 cursor-pointer"
            >
              <span>Join Roster</span>
              <svg class="w-4 h-4 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>


      <!-- Latest Matches Teaser (Live API Data) -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest">Official VPG Feed</div>
            <h2 class="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">Recent RYVL Results</h2>
          </div>
          <a routerLink="/results" class="text-xs font-bold text-[#EAE905] hover:underline flex items-center gap-1">
            <span>View All Match Results</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </a>
        </div>

        @if(isLoadingResults()) {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            @for (i of [1,2,3]; track i) {
              <div class="h-32 rounded-2xl bg-white/5 animate-pulse border border-white/10"></div>
            }
          </div>
        } @else if (recentMatches().length === 0) {
          <div class="p-8 rounded-2xl bg-[#0d0d0e] border border-white/10 text-center text-slate-400 text-sm">
            No completed RYVL matches have been published for this competition yet.
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            @for (m of recentMatches(); track m.id) {
              <div class="p-5 rounded-2xl bg-[#0d0d0e] border border-white/10 hover:border-[#EAE905]/40 transition space-y-3">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                  <span class="font-mono font-bold text-[#EAE905]">MATCHDAY {{ m.matchDay || '?' }}</span>
                  <span>{{ m.dateFormattedEn || m.dateFormattedRo }}</span>
                </div>

                <div class="flex items-center justify-between gap-3 pt-1">
                  <!-- Home Team -->
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    @if(m.homeLogoUrl) {
                      <img [src]="m.homeLogoUrl" alt="" class="w-7 h-7 object-contain shrink-0" />
                    }
                    <span class="text-xs font-bold text-white truncate" [class.text-[#EAE905]]="/^\s*ryvl(?:\s+esports)?\s*$/i.test(m.homeName)">
                      {{ m.homeName }}
                    </span>
                  </div>

                  <!-- Score -->
                  <div class="px-3 py-1 rounded-lg bg-black/60 border border-white/10 font-mono font-black text-sm text-white shrink-0">
                    {{ m.homeScore ?? '-' }} : {{ m.awayScore ?? '-' }}
                  </div>

                  <!-- Away Team -->
                  <div class="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                    <span class="text-xs font-bold text-white truncate" [class.text-[#EAE905]]="/^\s*ryvl(?:\s+esports)?\s*$/i.test(m.awayName)">
                      {{ m.awayName }}
                    </span>
                    @if(m.awayLogoUrl) {
                      <img [src]="m.awayLogoUrl" alt="" class="w-7 h-7 object-contain shrink-0" />
                    }
                  </div>
                </div>

                <div class="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                  <span class="text-emerald-400 font-semibold">● Confirmed</span>
                  <a [href]="'https://virtualprogaming.com/match/' + m.id" target="_blank" class="hover:text-white">
                    VPG Details ↗
                  </a>
                </div>
              </div>
            }
          </div>
        }
      </section>

      <!-- Brand Pillars: The RYVL Philosophy -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div class="text-center space-y-3 max-w-2xl mx-auto">
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest">Our DNA</div>
          <h2 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">The Three Pillars of RYVL</h2>
          <p class="text-sm text-slate-400">
            We don't build squads for casual participation. Every tactic, formation, and trial is executed with one purpose: perfection.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Pillar 1 -->
          <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 relative overflow-hidden group hover:border-[#EAE905]/40 transition duration-300">
            <div class="w-14 h-14 rounded-2xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-2xl text-[#EAE905] mb-6">
              ⚔️
            </div>
            <h3 class="text-xl font-bold text-white uppercase tracking-wide mb-2">Relentless Execution</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              Every pass, run, and defensive coverage is calculated. We hold ourselves to uncompromising competitive standards before every kickoff.
            </p>
          </div>

          <!-- Pillar 2 -->
          <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 relative overflow-hidden group hover:border-[#EAE905]/40 transition duration-300">
            <div class="w-14 h-14 rounded-2xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-2xl text-[#EAE905] mb-6">
              🧠
            </div>
            <h3 class="text-xl font-bold text-white uppercase tracking-wide mb-2">Tactical Mastery</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              Adaptable formations, situational pressing triggers, and automated telemetry tools ensure our squad controls the tempo in any scenario.
            </p>
          </div>

          <!-- Pillar 3 -->
          <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 relative overflow-hidden group hover:border-[#EAE905]/40 transition duration-300">
            <div class="w-14 h-14 rounded-2xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-2xl text-[#EAE905] mb-6">
              🛡️
            </div>
            <h3 class="text-xl font-bold text-white uppercase tracking-wide mb-2">Brotherhood & Rivalry</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              A united locker room forged by high chemistry and mutual respect. We back each other on the pitch and rival the top clubs in Europe.
            </p>
          </div>
        </div>
      </section>

      <!-- Recruitment CTA Banner -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="rounded-3xl bg-gradient-to-r from-[#121214] via-[#1a1a1f] to-[#121214] border-2 border-[#EAE905]/30 p-8 sm:p-14 relative overflow-hidden shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div class="space-y-4 max-w-xl text-center md:text-left relative z-10">
            <span class="text-xs font-mono font-bold text-[#EAE905] uppercase tracking-widest">Trials Now Open</span>
            <h3 class="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight leading-tight">
              Ready To Wear The Yellow & Black?
            </h3>
            <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
              We are actively scouting elite Pro Clubs players across Attack, Midfield, Defense and GK for upcoming VPG Superliga campaigns.
            </p>
          </div>

          <div class="relative z-10 shrink-0">
            <a
              routerLink="/recruitment"
              class="btn-yellow px-8 py-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-xl shadow-[#EAE905]/20 transition transform hover:scale-105 inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Submit Trial Application</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly recentMatches = signal<VpgMatchItem[]>([]);
  readonly isLoadingResults = signal<boolean>(true);

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.getRyvlPerformance();
      this.recentMatches.set((res?.recentResults || []).slice(0, 3));
    } catch (err) {
      console.warn('Could not load recent results for home hero:', err);
    } finally {
      this.isLoadingResults.set(false);
    }
  }
}
