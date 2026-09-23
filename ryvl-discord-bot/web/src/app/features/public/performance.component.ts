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
import {
  RyvlPerformanceResponse,
  RyvlPerformanceStats,
  RyvlCompetition,
  VpgMatchItem,
} from '../../core/models';

@Component({
  selector: 'app-public-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <!-- Section Header -->
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#EAE905]/15 pb-6">
        <div>
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Squad Telemetry & Analytics</div>
          <h1 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <span>RYVL Team Performance</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30">
              11v11 PRO
            </span>
          </h1>
          <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Live match analytics, form progression, and competitive outcomes for RYVL Esports across official tournaments.
          </p>
        </div>

        <!-- Competition Filter Selector -->
        <div class="flex flex-wrap items-center gap-2">
          @for (comp of competitions(); track comp.slug) {
            <button
              type="button"
              (click)="selectCompetition(comp.slug)"
              class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
              [ngClass]="selectedCompSlug() === comp.slug ? 'bg-[#EAE905] !text-black shadow-lg shadow-[#EAE905]/20 font-black' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
            >
              <span [class.!text-black]="selectedCompSlug() === comp.slug">{{ comp.name }}</span>
              @if (!comp.active) {
                <span
                  class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold"
                  [ngClass]="selectedCompSlug() === comp.slug ? 'bg-black/20 !text-black border border-black/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'"
                >
                  TBA
                </span>
              }
            </button>
          }
        </div>
      </div>

      <!-- Navigation Sub-Tabs: Performance & Detailed Feeds -->
      <div class="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
        <span class="px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#EAE905] !text-black shadow-md shadow-[#EAE905]/15 flex items-center gap-1.5 cursor-default">
          <span>📊</span>
          <span class="!text-black">RYVL Telemetry</span>
        </span>
        <a
          routerLink="/results"
          class="px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#121214] text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
        >
          <span>📋</span>
          <span>Match Results</span>
        </a>
        <a
          routerLink="/fixtures"
          class="px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#121214] text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
        >
          <span>📅</span>
          <span>Fixtures Schedule</span>
        </a>
        <a
          routerLink="/standings"
          class="px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#121214] text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
        >
          <span>🏆</span>
          <span>League Table & Standings</span>
        </a>
      </div>

      @if (isLoading()) {
        <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
          <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-sm font-bold text-slate-300">Retrieving RYVL performance metrics...</p>
        </div>
      } @else if (error()) {
        <div class="p-12 rounded-3xl bg-rose-950/30 border border-rose-600/40 text-center space-y-3">
          <div class="text-3xl">⚠️</div>
          <h3 class="text-base font-bold text-rose-300">Unable to load telemetry</h3>
          <p class="text-xs text-slate-400">{{ error() }}</p>
          <button
            type="button"
            (click)="loadPerformance()"
            class="btn-yellow px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
          >
            Retry Telemetry
          </button>
        </div>
      } @else {
        <!-- Main Performance Dashboard -->
        <div class="space-y-12">
          <!-- Hero Metrics Cards Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Win Rate Card -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-[#0c0c0e] via-[#111116] to-[#0c0c0e] border border-[#EAE905]/30 shadow-xl relative overflow-hidden group">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-slate-400 uppercase tracking-widest">Victory Rate</span>
                <span class="text-xl">🏆</span>
              </div>
              <div class="mt-4 flex items-baseline gap-2">
                <span class="text-4xl sm:text-5xl font-black text-[#EAE905] tracking-tight">
                  {{ stats()?.winRate || 0 }}%
                </span>
                <span class="text-xs text-slate-400 font-semibold">win ratio</span>
              </div>
              <div class="mt-3 w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  class="bg-[#EAE905] h-full rounded-full transition-all duration-700"
                  [style.width.%]="stats()?.winRate || 0"
                ></div>
              </div>
              <div class="text-[11px] text-slate-400 mt-2 font-mono">
                {{ stats()?.wins || 0 }} Wins in {{ stats()?.played || 0 }} Matches
              </div>
            </div>

            <!-- Campaign Record -->
            <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 shadow-xl relative overflow-hidden hover:border-[#EAE905]/40 transition">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-slate-400 uppercase tracking-widest">Match Record</span>
                <span class="text-xl">⚔️</span>
              </div>
              <div class="mt-4 flex items-baseline gap-3">
                <div class="text-center">
                  <span class="text-2xl font-black text-emerald-400">{{ stats()?.wins || 0 }}</span>
                  <div class="text-[10px] text-slate-400 uppercase font-mono">W</div>
                </div>
                <span class="text-slate-600 font-bold">-</span>
                <div class="text-center">
                  <span class="text-2xl font-black text-slate-300">{{ stats()?.draws || 0 }}</span>
                  <div class="text-[10px] text-slate-400 uppercase font-mono">D</div>
                </div>
                <span class="text-slate-600 font-bold">-</span>
                <div class="text-center">
                  <span class="text-2xl font-black text-rose-400">{{ stats()?.losses || 0 }}</span>
                  <div class="text-[10px] text-slate-400 uppercase font-mono">L</div>
                </div>
              </div>
              <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span class="text-slate-400">Total Points</span>
                <span class="font-black text-white">{{ stats()?.points || 0 }} PTS</span>
              </div>
            </div>

            <!-- Goal Dynamics -->
            <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 shadow-xl relative overflow-hidden hover:border-[#EAE905]/40 transition">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-slate-400 uppercase tracking-widest">Goal Dynamics</span>
                <span class="text-xl">⚽</span>
              </div>
              <div class="mt-4 flex items-baseline gap-2">
                <span class="text-4xl font-black text-white">
                  {{ stats()?.goalsFor || 0 }}
                </span>
                <span class="text-xs text-emerald-400 font-mono">
                  ({{ stats()?.goalsPerMatch || 0 }}/game)
                </span>
              </div>
              <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span class="text-slate-400">Goal Difference</span>
                <span
                  class="font-black font-mono"
                  [ngClass]="(stats()?.goalDifference || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                >
                  {{ (stats()?.goalDifference || 0) > 0 ? '+' : '' }}{{ stats()?.goalDifference || 0 }}
                </span>
              </div>
            </div>

            <!-- Defensive Discipline -->
            <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 shadow-xl relative overflow-hidden hover:border-[#EAE905]/40 transition">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-slate-400 uppercase tracking-widest">Defensive Wall</span>
                <span class="text-xl">🛡️</span>
              </div>
              <div class="mt-4 flex items-baseline gap-2">
                <span class="text-4xl font-black text-white">
                  {{ stats()?.cleanSheets || 0 }}
                </span>
                <span class="text-xs text-slate-400 font-mono">clean sheets</span>
              </div>
              <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span class="text-slate-400">Goals Conceded</span>
                <span class="font-black text-rose-400 font-mono">{{ stats()?.goalsAgainst || 0 }} ({{ stats()?.concededPerMatch || 0 }}/game)</span>
              </div>
            </div>
          </div>

          <!-- Form Guide & Venue Breakdown -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Form Guide Banner -->
            <div class="lg:col-span-2 p-6 sm:p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
              <div class="flex items-center justify-between">
                <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Form Guide</div>
                <div class="text-xs text-slate-400">Most Recent 5 Clashes</div>
              </div>

              @if ((stats()?.currentStreak || []).length === 0) {
                <div class="py-6 text-center text-xs text-slate-500 font-mono">
                  No completed matches recorded yet for this championship.
                </div>
              } @else {
                <div class="flex items-center gap-3">
                  @for (s of stats()?.currentStreak || []; track $index) {
                    <div
                      class="w-11 h-11 rounded-2xl flex items-center justify-center font-black font-mono text-sm shadow-md"
                      [ngClass]="{
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40': s === 'W',
                        'bg-rose-500/20 text-rose-400 border border-rose-500/40': s === 'L',
                        'bg-slate-500/20 text-slate-300 border border-slate-500/40': s === 'D'
                      }"
                    >
                      {{ s }}
                    </div>
                  }
                  <span class="text-xs text-slate-400 ml-2">Recent &rarr; Oldest</span>
                </div>
              }

              <!-- League Position Status -->
              <div class="pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                <div class="text-slate-400">
                  Current Competition: <strong class="text-white">{{ stats()?.competitionName }}</strong>
                </div>
                @if (stats()?.standingsPosition) {
                  <div class="text-[#EAE905] font-bold">
                    Ranked #{{ stats()?.standingsPosition }} in {{ stats()?.competitionName || 'Active Competition' }}
                  </div>
                }
              </div>
            </div>

            <!-- Home vs Away Snapshot -->
            <div class="p-6 sm:p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
              <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Venue Analysis</div>

              <div class="space-y-3">
                <div class="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span>🏠</span>
                    <span class="font-bold text-white">Home Record</span>
                  </div>
                  <span class="font-mono text-emerald-400 font-bold">
                    {{ stats()?.homeRecord?.wins || 0 }}W - {{ stats()?.homeRecord?.draws || 0 }}D - {{ stats()?.homeRecord?.losses || 0 }}L
                  </span>
                </div>

                <div class="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span>✈️</span>
                    <span class="font-bold text-white">Away Record</span>
                  </div>
                  <span class="font-mono text-emerald-400 font-bold">
                    {{ stats()?.awayRecord?.wins || 0 }}W - {{ stats()?.awayRecord?.draws || 0 }}D - {{ stats()?.awayRecord?.losses || 0 }}L
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Upcoming RYVL Clashes -->
          <div class="space-y-6">
            <div class="flex items-center justify-between border-b border-[#EAE905]/15 pb-4">
              <div>
                <h2 class="text-2xl font-black text-white uppercase tracking-tight">Upcoming RYVL Matches</h2>
                <p class="text-xs text-slate-400 mt-0.5">Next scheduled fixtures for RYVL Esports</p>
              </div>
              <a
                routerLink="/fixtures"
                class="text-xs font-bold text-[#EAE905] hover:underline"
              >
                Full Calendar &rarr;
              </a>
            </div>

            @if (upcoming().length === 0) {
              <div class="p-8 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center text-xs text-slate-400">
                No upcoming fixtures scheduled in the immediate calendar. Check back on match days.
              </div>
            } @else {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                @for (m of upcoming(); track m.id) {
                  <div class="p-5 rounded-2xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition space-y-3">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="px-2 py-0.5 rounded bg-[#EAE905]/10 text-[#EAE905] font-mono font-bold">
                        MATCHDAY {{ m.matchDay }}
                      </span>
                      <span class="text-slate-400">{{ m.dateFormattedEn || m.dateFormattedRo }}</span>
                    </div>

                    <div class="flex items-center justify-between gap-4 pt-1">
                      <div class="flex items-center gap-2 flex-1 min-w-0">
                        @if (m.homeLogoUrl) {
                          <img [src]="m.homeLogoUrl" alt="" class="w-8 h-8 object-contain shrink-0" />
                        }
                        <span class="text-sm font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.homeName)">
                          {{ m.homeName }}
                        </span>
                      </div>

                      <div class="text-xs font-mono font-black text-slate-500 px-2">VS</div>

                      <div class="flex items-center justify-end gap-2 flex-1 min-w-0 text-right">
                        <span class="text-sm font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.awayName)">
                          {{ m.awayName }}
                        </span>
                        @if (m.awayLogoUrl) {
                          <img [src]="m.awayLogoUrl" alt="" class="w-8 h-8 object-contain shrink-0" />
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Recent RYVL Results Feed -->
          <div class="space-y-6">
            <div class="flex items-center justify-between border-b border-[#EAE905]/15 pb-4">
              <div>
                <h2 class="text-2xl font-black text-white uppercase tracking-tight">Recent RYVL Match Results</h2>
                <p class="text-xs text-slate-400 mt-0.5">Completed clashes and scorelines</p>
              </div>
              <a
                routerLink="/results"
                class="text-xs font-bold text-[#EAE905] hover:underline"
              >
                All Results &rarr;
              </a>
            </div>

            @if (recent().length === 0) {
              <div class="p-8 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center text-xs text-slate-400">
                No completed results found for this competition yet.
              </div>
            } @else {
              <div class="space-y-3">
                @for (m of recent(); track m.id) {
                  @let isHome = /ryvl|rival/i.test(m.homeName);
                  @let ryvlScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
                  @let oppScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
                  @let outcome = ryvlScore > oppScore ? 'WIN' : ryvlScore < oppScore ? 'LOSS' : 'DRAW';

                  <div class="p-5 rounded-2xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                      <span
                        class="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider"
                        [ngClass]="{
                          'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40': outcome === 'WIN',
                          'bg-rose-500/20 text-rose-400 border border-rose-500/40': outcome === 'LOSS',
                          'bg-slate-500/20 text-slate-300 border border-slate-500/40': outcome === 'DRAW'
                        }"
                      >
                        {{ outcome }}
                      </span>
                      <span class="text-xs font-mono text-slate-400">MD {{ m.matchDay }}</span>
                      <span class="text-xs text-slate-500">•</span>
                      <span class="text-xs text-slate-400">{{ m.dateFormattedEn || m.dateFormattedRo }}</span>
                    </div>

                    <div class="flex items-center gap-4 text-center">
                      <div class="flex items-center gap-2 justify-end min-w-[120px]">
                        <span class="text-sm font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.homeName)">
                          {{ m.homeName }}
                        </span>
                        @if (m.homeLogoUrl) {
                          <img [src]="m.homeLogoUrl" alt="" class="w-6 h-6 object-contain" />
                        }
                      </div>

                      <div class="px-3 py-1 rounded-lg bg-black/80 font-mono font-black text-sm text-white border border-white/15">
                        {{ m.homeScore ?? '-' }} : {{ m.awayScore ?? '-' }}
                      </div>

                      <div class="flex items-center gap-2 justify-start min-w-[120px]">
                        @if (m.awayLogoUrl) {
                          <img [src]="m.awayLogoUrl" alt="" class="w-6 h-6 object-contain" />
                        }
                        <span class="text-sm font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.awayName)">
                          {{ m.awayName }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class PerformanceComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly performanceData = signal<RyvlPerformanceResponse | null>(null);
  readonly selectedCompSlug = signal<string>('Superliga-Romania');

  readonly stats = computed(() => this.performanceData()?.stats || null);
  readonly competitions = computed(() => this.performanceData()?.competitions || []);
  readonly recent = computed(() => this.performanceData()?.recentResults || []);
  readonly upcoming = computed(() => this.performanceData()?.upcomingFixtures || []);

  ngOnInit(): void {
    this.loadPerformance();
  }

  selectCompetition(slug: string): void {
    this.selectedCompSlug.set(slug);
    this.loadPerformance(slug);
  }

  async loadPerformance(slug?: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await this.api.getRyvlPerformance(slug || this.selectedCompSlug());
      this.performanceData.set(data);
      if (data.activeCompetition) {
        this.selectedCompSlug.set(data.activeCompetition);
      }
    } catch (err: any) {
      console.error('Failed to load RYVL team performance:', err);
      this.error.set(err.message || 'Error communicating with telemetry service.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
