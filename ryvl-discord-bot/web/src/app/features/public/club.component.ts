import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';

@Component({
  selector: 'app-public-club',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 animate-fadeIn">
      <!-- Section Header -->
      <div class="border-b border-[#EAE905]/15 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">
            EA Sports FC 25 Pro Clubs
          </div>
          <h1 class="text-4xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <span>RYVL Club Tracker</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30">
              11v11
            </span>
          </h1>
          <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
            Live telemetry, recent match clashes, and competitive campaign performance pulled directly from the EA Sports Pro Clubs API for RYVL Esports.
          </p>
        </div>

        <button
          type="button"
          (click)="refreshData()"
          [disabled]="isLoadingMatches() || isLoadingConfig()"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer self-start md:self-auto disabled:opacity-50"
        >
          <svg
            class="w-3.5 h-3.5 text-[#EAE905]"
            [class.animate-spin]="isLoadingMatches() || isLoadingConfig()"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Telemetry</span>
        </button>
      </div>

      <!-- Club Showcase Hero Card -->
      <div class="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#0c0c0e] via-[#111116] to-[#0c0c0e] border-2 border-[#EAE905]/30 relative overflow-hidden shadow-2xl">
        <div class="absolute -right-20 -top-20 w-80 h-80 bg-[#EAE905]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
          <div class="flex items-center gap-6">
            <!-- Club Crest -->
            <div class="w-24 h-24 rounded-2xl bg-black/80 border-2 border-[#EAE905]/40 p-2 flex items-center justify-center shrink-0 shadow-2xl">
              @if(clubCrestUrl()) {
                <img [src]="clubCrestUrl()" alt="Crest" class="w-full h-full object-contain" />
              } @else {
                <img src="/assets/branding/ryvl-mark.png" alt="RYVL Crest" class="w-full h-full object-contain" />
              }
            </div>

            <div class="space-y-2">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30">
                  {{ platformLabel() }}
                </span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-white/10 text-white border border-white/10">
                  {{ bestDivision() }}
                </span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Verified EA Bridge
                </span>
              </div>

              <h2 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
                {{ clubName() }}
              </h2>

              <p class="text-xs text-slate-400 flex items-center gap-2">
                <span>EA Club ID: <code class="text-slate-300 font-mono bg-black/50 px-1.5 py-0.5 rounded border border-white/10">{{ clubId() }}</code></span>
                <span>•</span>
                <span>Tier: <span class="text-white font-bold">Elite 11v11</span></span>
              </p>
            </div>
          </div>

          <!-- Hero Action Links -->
          <div class="flex items-center gap-3 flex-wrap">
            <a
              routerLink="/team"
              class="btn-yellow px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition shadow-lg shadow-[#EAE905]/15 flex items-center gap-2 cursor-pointer"
            >
              <span>View Squad Roster</span>
              <span>&rarr;</span>
            </a>
            <a
              routerLink="/performance"
              class="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              VPG Performance
            </a>
          </div>
        </div>

        <!-- Metric Badges Row -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mt-8 pt-8 border-t border-white/10">
          <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Campaign Record</div>
            <div class="text-lg font-black text-white mt-1">
              {{ wins() }}W - {{ ties() }}D - {{ losses() }}L
            </div>
            <div class="text-[11px] text-emerald-400 font-bold mt-0.5">{{ winRate() }}% Win Rate</div>
          </div>

          <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Skill Rating</div>
            <div class="text-lg font-black text-[#EAE905] mt-1">
              {{ skillRating() }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">{{ bestDivision() }} Peak</div>
          </div>

          <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Goals Scored</div>
            <div class="text-lg font-black text-emerald-400 mt-1">
              {{ goals() }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">Conceded: {{ goalsAgainst() }}</div>
          </div>

          <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Goal Differential</div>
            <div
              class="text-lg font-black mt-1"
              [ngClass]="goalDiff() >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ goalDiff() >= 0 ? '+' : '' }}{{ goalDiff() }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">{{ totalMatches() }} Matches Played</div>
          </div>

          <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Clean Sheets</div>
            <div class="text-lg font-black text-cyan-400 mt-1">
              {{ cleanSheets() }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">Match Shutouts</div>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          (click)="activeTab.set('matches')"
          class="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
          [ngClass]="activeTab() === 'matches' ? 'bg-[#EAE905] !text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
        >
          <span [class.!text-black]="activeTab() === 'matches'">Recent Match Clashes</span>
          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold"
            [ngClass]="activeTab() === 'matches' ? 'bg-black/20 !text-black' : 'bg-white/10 text-slate-400'"
          >
            {{ matches().length }}
          </span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('roster')"
          class="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
          [ngClass]="activeTab() === 'roster' ? 'bg-[#EAE905] !text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
        >
          <span [class.!text-black]="activeTab() === 'roster'">Squad Leaderboard</span>
          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold"
            [ngClass]="activeTab() === 'roster' ? 'bg-black/20 !text-black' : 'bg-white/10 text-slate-400'"
          >
            {{ members().length }}
          </span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('summary')"
          class="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
          [ngClass]="activeTab() === 'summary' ? 'bg-[#EAE905] !text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
        >
          <span [class.!text-black]="activeTab() === 'summary'">Campaign Telemetry</span>
        </button>
      </div>

      <!-- Tab 1: Recent Matches Feed -->
      @if(activeTab() === 'matches') {
        @if(isLoadingMatches()) {
          <div class="py-20 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
            <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-sm font-bold text-slate-300">Synchronizing match telemetry from EA Sports servers...</p>
          </div>
        } @else if (matches().length === 0) {
          <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-3">
            <div class="text-4xl">⚽</div>
            <h3 class="text-base font-bold text-white uppercase">No Matches Synchronized</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto">
              No recent matches recorded on EA servers for this club yet. Completed games will appear here automatically.
            </p>
          </div>
        } @else {
          <div class="space-y-5">
            @for (match of matches(); track match.matchId) {
              <div class="rounded-3xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/30 transition overflow-hidden shadow-xl">
                <!-- Match Header Bar -->
                <div class="px-6 py-3.5 bg-[#121214] border-b border-white/5 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div class="flex items-center gap-3">
                    <!-- Outcome Badge -->
                    <span
                      class="px-3 py-1 rounded-full font-black text-[11px] tracking-wide"
                      [ngClass]="{
                        'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30': match.outcome === 'WIN',
                        'bg-rose-500/15 text-rose-400 border border-rose-500/30': match.outcome === 'LOSS',
                        'bg-amber-500/15 text-amber-300 border border-amber-500/30': match.outcome === 'DRAW'
                      }"
                    >
                      {{ match.outcome === 'WIN' ? '🟢 VICTORY' : match.outcome === 'LOSS' ? '🔴 DEFEAT' : '⚪ DRAW' }}
                    </span>

                    <span class="text-slate-300 font-semibold">{{ match.matchType === '1' || match.matchType === 1 ? 'League Match' : 'Pro Clubs Match' }}</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-slate-400">{{ formatTimestamp(match.timestamp) }}</span>
                  </div>

                  <button
                    type="button"
                    (click)="toggleExpandMatch(match.matchId)"
                    class="text-xs text-[#EAE905] hover:text-[#d8d704] font-bold px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                  >
                    {{ expandedMatchId() === match.matchId ? 'Hide Squad Stats ▲' : 'View Squad Stats ▼' }}
                  </button>
                </div>

                <!-- Match Scoreboard Display -->
                <div class="p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                  <!-- Tracked Team (Left) -->
                  <div class="flex items-center gap-5 flex-1 justify-end order-1 md:order-1 text-right">
                    <div>
                      <div class="text-base sm:text-lg font-black text-white uppercase tracking-tight">{{ match.trackedClub.name }}</div>
                      <div class="text-[11px] text-slate-400">{{ match.trackedPlayers.length }} Players Rated</div>
                    </div>
                    <img
                      [src]="match.trackedClub.crestUrl || defaultCrest"
                      alt="Tracked Crest"
                      class="w-14 h-14 object-contain rounded-2xl bg-black/60 p-1.5 border border-white/10 shrink-0"
                    />
                  </div>

                  <!-- Central Score Box -->
                  <div class="flex items-center gap-4 px-8 py-3 rounded-2xl bg-[#141419] border border-white/10 shadow-inner order-2">
                    <span
                      class="text-3xl font-black font-mono"
                      [ngClass]="match.trackedClub.score > match.opponentClub.score ? 'text-[#EAE905]' : 'text-white'"
                    >
                      {{ match.trackedClub.score }}
                    </span>
                    <span class="text-slate-500 font-bold text-xl">:</span>
                    <span
                      class="text-3xl font-black font-mono"
                      [ngClass]="match.opponentClub.score > match.trackedClub.score ? 'text-rose-400' : 'text-white'"
                    >
                      {{ match.opponentClub.score }}
                    </span>
                  </div>

                  <!-- Opponent Team (Right) -->
                  <div class="flex items-center gap-5 flex-1 order-3">
                    <img
                      [src]="match.opponentClub.crestUrl || defaultCrest"
                      alt="Opponent Crest"
                      class="w-14 h-14 object-contain rounded-2xl bg-black/60 p-1.5 border border-white/10 shrink-0"
                    />
                    <div>
                      <div class="text-base sm:text-lg font-black text-white uppercase tracking-tight">{{ match.opponentClub.name }}</div>
                      <div class="text-[11px] text-slate-400">Club ID: {{ match.opponentClub.id }}</div>
                    </div>
                  </div>
                </div>

                <!-- Expanded Squad Performance Breakdown -->
                @if(expandedMatchId() === match.matchId) {
                  <div class="px-6 pb-6 pt-3 border-t border-white/10 bg-[#121214] space-y-6 animate-fadeIn">
                    <!-- Team Aggregate Statistics -->
                    @if(match.trackedClub.aggregate || match.opponentClub.aggregate) {
                      <div>
                        <h4 class="text-xs font-mono font-bold uppercase tracking-wider text-[#EAE905] mb-3">
                          Match Aggregate Comparison
                        </h4>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div class="bg-[#18181c] p-3 rounded-xl border border-white/5">
                            <div class="text-slate-400 text-[10px] uppercase font-mono">Shots on Target</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.shots ?? 0 }} vs {{ match.opponentClub.aggregate?.shots ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#18181c] p-3 rounded-xl border border-white/5">
                            <div class="text-slate-400 text-[10px] uppercase font-mono">Passes Completed</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.passesmade ?? 0 }} / {{ match.trackedClub.aggregate?.passattempts ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#18181c] p-3 rounded-xl border border-white/5">
                            <div class="text-slate-400 text-[10px] uppercase font-mono">Tackles Won</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.tacklesmade ?? 0 }} vs {{ match.opponentClub.aggregate?.tacklesmade ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#18181c] p-3 rounded-xl border border-white/5">
                            <div class="text-slate-400 text-[10px] uppercase font-mono">Saves</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.saves ?? 0 }} vs {{ match.opponentClub.aggregate?.saves ?? 0 }}
                            </div>
                          </div>
                        </div>
                      </div>
                    }

                    <!-- RYVL Squad Performance Table -->
                    @if(match.trackedPlayers.length > 0) {
                      <div>
                        <h4 class="text-xs font-mono font-bold uppercase tracking-wider text-[#EAE905] mb-2 flex items-center justify-between">
                          <span>{{ match.trackedClub.name }} Player Performance</span>
                          <span class="text-slate-400 font-normal">Bucharest Telemetry</span>
                        </h4>
                        <div class="overflow-x-auto rounded-xl border border-white/10">
                          <table class="w-full text-left text-xs">
                            <thead class="bg-[#18181c] text-slate-400 text-[10px] uppercase font-bold border-b border-white/10">
                              <tr>
                                <th class="py-2.5 px-3">Player</th>
                                <th class="py-2.5 px-3">Pos</th>
                                <th class="py-2.5 px-3 text-center">Rating</th>
                                <th class="py-2.5 px-3 text-center">Goals</th>
                                <th class="py-2.5 px-3 text-center">Assists</th>
                                <th class="py-2.5 px-3 text-center">Passes</th>
                                <th class="py-2.5 px-3 text-center">Tackles</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5 bg-[#141419]">
                              @for (p of match.trackedPlayers; track p.gamertag) {
                                <tr class="hover:bg-white/5 transition">
                                  <td class="py-2 px-3 font-semibold text-white flex items-center gap-1.5">
                                    @if(p.isMom) {
                                      <span title="Man of the Match" class="text-amber-400">⭐</span>
                                    }
                                    <span>{{ p.gamertag }}</span>
                                  </td>
                                  <td class="py-2 px-3 text-slate-400 font-mono text-[11px] uppercase">{{ p.position }}</td>
                                  <td class="py-2 px-3 text-center font-bold text-[#EAE905]">{{ p.rating }}</td>
                                  <td class="py-2 px-3 text-center font-bold text-emerald-400">{{ p.goals }}</td>
                                  <td class="py-2 px-3 text-center font-bold text-sky-400">{{ p.assists }}</td>
                                  <td class="py-2 px-3 text-center text-slate-300">{{ p.passesMade }}/{{ p.passAttempts }}</td>
                                  <td class="py-2 px-3 text-center text-slate-300">{{ p.tacklesMade }}/{{ p.tackleAttempts }}</td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      <!-- Tab 2: Squad Leaderboard & Member Statistics -->
      @if(activeTab() === 'roster') {
        @if(isLoadingMembers()) {
          <div class="py-20 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
            <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-sm font-bold text-slate-300">Loading club member leaderboard...</p>
          </div>
        } @else if (members().length === 0) {
          <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-3">
            <div class="text-4xl">👥</div>
            <h3 class="text-base font-bold text-white uppercase">No Member Records</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto">Could not fetch individual member statistics for {{ clubName() }}.</p>
          </div>
        } @else {
          <div class="rounded-3xl bg-[#0c0c0e] border border-white/10 overflow-hidden shadow-2xl">
            <div class="p-6 bg-[#121214] border-b border-white/10 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 class="text-lg font-bold text-white uppercase tracking-tight">EA Pro Clubs Member Statistics</h3>
                <p class="text-xs text-slate-400">All-time competitive performance recorded on official EA servers.</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30">
                {{ members().length }} Registered Players
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-[#16161a] text-slate-400 text-[10px] uppercase font-bold border-b border-white/10">
                  <tr>
                    <th class="py-3 px-4">Player</th>
                    <th class="py-3 px-4 text-center">Matches</th>
                    <th class="py-3 px-4 text-center">Goals</th>
                    <th class="py-3 px-4 text-center">Assists</th>
                    <th class="py-3 px-4 text-center">MOTM</th>
                    <th class="py-3 px-4 text-center">Avg Rating</th>
                    <th class="py-3 px-4 text-center">Pass %</th>
                    <th class="py-3 px-4 text-center">Tackle %</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 bg-[#0c0c0e]">
                  @for (m of members(); track m.name) {
                    <tr class="hover:bg-white/5 transition">
                      <td class="py-3 px-4 font-bold text-white flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl bg-[#141419] border border-white/10 flex items-center justify-center text-xs font-black text-[#EAE905]">
                          {{ m.name.slice(0, 2).toUpperCase() }}
                        </div>
                        <span>{{ m.name }}</span>
                      </td>
                      <td class="py-3 px-4 text-center font-semibold text-slate-200">{{ m.gamesPlayed || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-emerald-400">{{ m.goals || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-sky-400">{{ m.assists || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-amber-400">{{ m.manOfTheMatch || 0 }}</td>
                      <td class="py-3 px-4 text-center font-extrabold text-[#EAE905]">{{ m.rating ? (+m.rating).toFixed(1) : '-' }}</td>
                      <td class="py-3 px-4 text-center text-slate-300">{{ m.passSuccessRate || 0 }}%</td>
                      <td class="py-3 px-4 text-center text-slate-300">{{ m.tackleSuccessRate || 0 }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      <!-- Tab 3: Campaign Telemetry -->
      @if(activeTab() === 'summary') {
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Win Efficiency</div>
            <div class="text-4xl font-black text-white">{{ winRate() }}%</div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Calculated across {{ totalMatches() }} competitive 11v11 fixtures recorded on EA Sports FC Pro Clubs.
            </p>
            <div class="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-[#EAE905]" [style.width.%]="winRate()"></div>
            </div>
          </div>

          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-emerald-400 uppercase tracking-wider">Attack Output</div>
            <div class="text-4xl font-black text-emerald-400">{{ goals() }}</div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Total goals scored with an average of {{ totalMatches() > 0 ? (goals() / totalMatches()).toFixed(2) : 0 }} goals per game.
            </p>
          </div>

          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-cyan-400 uppercase tracking-wider">Defensive Rigor</div>
            <div class="text-4xl font-black text-cyan-400">{{ cleanSheets() }}</div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Match clean sheets registered without conceding a single opposition goal.
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class PublicClubComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly defaultCrest =
    'https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg';

  readonly activeTab = signal<'matches' | 'roster' | 'summary'>('matches');
  readonly config = signal<any>(null);
  readonly clubInfo = signal<any>(null);
  readonly overallStats = signal<any>(null);
  readonly matches = signal<any[]>([]);
  readonly members = signal<any[]>([]);

  readonly isLoadingMatches = signal<boolean>(false);
  readonly isLoadingMembers = signal<boolean>(false);
  readonly isLoadingConfig = signal<boolean>(false);
  readonly expandedMatchId = signal<string | null>(null);

  // Computed properties
  readonly clubName = computed(() => this.config()?.clubName || 'RYVL Esports');
  readonly clubId = computed(() => this.config()?.clubId || '128199');
  readonly platform = computed(() => this.config()?.platform || 'common-gen5');

  readonly platformLabel = computed(() => {
    const p = this.platform();
    if (p === 'common-gen5') return 'Cross-Platform 11v11';
    return p;
  });

  readonly clubCrestUrl = computed(() => {
    const info = this.clubInfo();
    const id = this.clubId();
    const clubData = info?.[id] || info || {};
    const identifier = clubData.teamId || clubData.customKit?.crestAssetId || '22';
    return `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${identifier}.png`;
  });

  readonly wins = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return parseInt(String(data?.wins || 0), 10);
  });

  readonly losses = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return parseInt(String(data?.losses || 0), 10);
  });

  readonly ties = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return parseInt(String(data?.ties || 0), 10);
  });

  readonly totalMatches = computed(() => this.wins() + this.losses() + this.ties());

  readonly winRate = computed(() => {
    const total = this.totalMatches();
    return total > 0 ? ((this.wins() / total) * 100).toFixed(1) : '0.0';
  });

  readonly skillRating = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return data?.skillRating || '1689';
  });

  readonly bestDivision = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return data?.bestDivision != null ? `Div ${data.bestDivision}` : 'Division 1';
  });

  readonly goals = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return parseInt(String(data?.goals || 0), 10);
  });

  readonly goalsAgainst = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return parseInt(String(data?.goalsAgainst || 0), 10);
  });

  readonly goalDiff = computed(() => this.goals() - this.goalsAgainst());

  readonly cleanSheets = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return data?.cleanSheets || 0;
  });

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId() || 'default';
    this.loadAllData(gid);
  }

  async loadAllData(guildId: string): Promise<void> {
    this.isLoadingConfig.set(true);
    try {
      const configRes = await this.api.getEaConfig(guildId);
      this.config.set(configRes.config);
      this.clubInfo.set(configRes.clubInfo);
      this.overallStats.set(configRes.overallStats);

      await Promise.all([this.loadMatches(guildId), this.loadMembers(guildId)]);
    } catch (err: any) {
      console.warn('Error loading public EA club telemetry:', err);
    } finally {
      this.isLoadingConfig.set(false);
    }
  }

  async loadMatches(guildId: string): Promise<void> {
    this.isLoadingMatches.set(true);
    try {
      const list = await this.api.getEaMatches(guildId, 15);
      this.matches.set(list || []);
    } catch (err: any) {
      console.warn('Failed to load EA matches:', err);
    } finally {
      this.isLoadingMatches.set(false);
    }
  }

  async loadMembers(guildId: string): Promise<void> {
    this.isLoadingMembers.set(true);
    try {
      const res = await this.api.getEaMembers(guildId);
      const membersList = res?.members || (Array.isArray(res) ? res : []);
      this.members.set(membersList);
    } catch (err: any) {
      console.warn('Failed to load EA members:', err);
    } finally {
      this.isLoadingMembers.set(false);
    }
  }

  refreshData(): void {
    const gid = this.guildStore.activeGuildId() || 'default';
    this.loadAllData(gid);
  }

  toggleExpandMatch(matchId: string): void {
    if (this.expandedMatchId() === matchId) {
      this.expandedMatchId.set(null);
    } else {
      this.expandedMatchId.set(matchId);
    }
  }

  formatTimestamp(timestamp: any): string {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Bucharest',
      });
    } catch {
      return String(timestamp);
    }
  }
}
