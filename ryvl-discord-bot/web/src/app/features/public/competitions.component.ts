import {
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-competitions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      <!-- Header -->
      <div class="border-b border-[#EAE905]/15 pb-6">
        <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Championship Circuits</div>
        <h1 class="text-4xl font-black text-white uppercase tracking-tight">Competitions & Leagues</h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
          RYVL Esports battles across top-flight domestic and continental 11v11 Pro Clubs competitions.
        </p>
      </div>

      <!-- Flagship League Card: VPG Superliga -->
      <div class="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#0c0c0e] via-[#111116] to-[#0c0c0e] border-2 border-[#EAE905]/30 relative overflow-hidden shadow-2xl">
        <div class="absolute -right-20 -top-20 w-80 h-80 bg-[#EAE905]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
          <div class="lg:col-span-2 space-y-5">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#EAE905]/15 border border-[#EAE905]/30 text-[#EAE905] text-xs font-mono font-bold uppercase">
              Premier Competition • Tier 1
            </div>

            <h2 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
              VPG Superliga România
            </h2>

            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              The premier national 11v11 Pro Clubs league in Romania governed by Virtual Pro Gaming. Bringing together the country's most formidable esports organizations in high-intensity seasonal campaigns.
            </p>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
              <div class="p-4 rounded-xl bg-black/50 border border-white/10">
                <div class="text-[10px] font-mono text-[#EAE905] uppercase">Match Schedule</div>
                <div class="text-sm font-bold text-white mt-1">Luni, Marți, Joi</div>
                <div class="text-[11px] text-slate-400">22:00 - 00:00 (Bucharest)</div>
              </div>

              <div class="p-4 rounded-xl bg-black/50 border border-white/10">
                <div class="text-[10px] font-mono text-[#EAE905] uppercase">Format</div>
                <div class="text-sm font-bold text-white mt-1">Full 11v11 Humans</div>
                <div class="text-[11px] text-slate-400">No Any / No CPU Bots</div>
              </div>

              <div class="p-4 rounded-xl bg-black/50 border border-white/10">
                <div class="text-[10px] font-mono text-[#EAE905] uppercase">Platform</div>
                <div class="text-sm font-bold text-white mt-1">EA Sports FC Pro</div>
                <div class="text-[11px] text-slate-400">Cross-Platform 11v11</div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3 pt-3">
              <a
                routerLink="/standings"
                class="px-5 py-2.5 rounded-xl bg-[#EAE905] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#d8d704] transition"
              >
                View League Table
              </a>
              <a
                routerLink="/fixtures"
                class="px-5 py-2.5 rounded-xl bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/15 transition border border-white/10"
              >
                Upcoming Fixtures
              </a>
              <a
                routerLink="/results"
                class="px-5 py-2.5 rounded-xl bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/15 transition border border-white/10"
              >
                Recent Results
              </a>
            </div>
          </div>

          <!-- League Badge Spotlight -->
          <div class="flex flex-col items-center justify-center p-6 rounded-2xl bg-black/40 border border-white/10 text-center space-y-3">
            <div class="w-24 h-24 rounded-full bg-[#EAE905]/10 border-2 border-[#EAE905] flex items-center justify-center text-4xl shadow-xl">
              ⚽
            </div>
            <div class="font-black text-white text-lg uppercase">Superliga Sezon 2</div>
            <p class="text-xs text-slate-400">Official tournament sanctioned by Virtual Pro Gaming Global.</p>
            <div class="w-full pt-3 border-t border-white/10 flex items-center justify-around text-xs">
              <div>
                <div class="text-[#EAE905] font-black text-base">16</div>
                <div class="text-[10px] text-slate-400 uppercase">Clubs</div>
              </div>
              <div class="h-6 w-px bg-white/10"></div>
              <div>
                <div class="text-[#EAE905] font-black text-base">30</div>
                <div class="text-[10px] text-slate-400 uppercase">Matchdays</div>
              </div>
              <div class="h-6 w-px bg-white/10"></div>
              <div>
                <div class="text-[#EAE905] font-black text-base">2026</div>
                <div class="text-[10px] text-slate-400 uppercase">Season</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Additional Tournaments Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- VPG Champions League -->
        <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/30 transition space-y-4">
          <div class="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl text-blue-400">
            ⭐
          </div>
          <h3 class="text-2xl font-bold text-white uppercase">VPG Champions League</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            The ultimate European Pro Clubs showcase. Pitting top clubs from England, Italy, Germany, France, Romania, and the Balkans in continental group stage clashes and high-stakes knockout ties.
          </p>
          <div class="text-xs font-mono text-[#EAE905]">Mid-Week European Match Nights</div>
        </div>

        <!-- Cupa României -->
        <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/30 transition space-y-4">
          <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400">
            🏆
          </div>
          <h3 class="text-2xl font-bold text-white uppercase">Cupa României Pro Clubs</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            Unforgiving knockout tournament format where single-elimination pressure defines champions. RYVL participates with dedicated tactical formations tailored for direct elimination matches.
          </p>
          <div class="text-xs font-mono text-[#EAE905]">Knockout Rounds & Golden Goal Extra Time</div>
        </div>
      </div>
    </div>
  `,
})
export class CompetitionsComponent {}
