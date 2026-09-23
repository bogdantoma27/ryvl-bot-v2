import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import {
  RyvlCompetition,
  RyvlPerformanceResponse,
  VpgMatchItem,
} from '../../core/models';

@Component({
  selector: 'app-admin-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-8 animate-fadeIn">
      <!-- Header -->
      <div class="border-b border-slate-700/60 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-[#EAE905] uppercase tracking-wider">Competitive Operations</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30">ADMIN</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase mt-1">RYVL Performance & Multi-League Manager</h1>
          <p class="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure tracked VPG competition slots, monitor RYVL Esports match telemetry, and broadcast official results, fixtures, and standing cards to Discord.
          </p>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            (click)="reloadAll()"
            [disabled]="isLoading()"
            class="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold text-slate-200 transition cursor-pointer flex items-center gap-2"
          >
            <span [class.animate-spin]="isLoading()">🔄</span>
            <span>Refresh</span>
          </button>
          <a
            routerLink="/performance"
            target="_blank"
            class="px-3.5 py-2 rounded-xl bg-[#EAE905]/15 border border-[#EAE905]/30 text-xs font-bold text-[#EAE905] hover:bg-[#EAE905]/25 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Public Page</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      <!-- Feedback Alerts -->
      @if (successMessage()) {
        <div class="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div class="flex items-center gap-2.5">
            <span class="text-base">✅</span>
            <span class="font-medium">{{ successMessage() }}</span>
          </div>
          <button type="button" (click)="successMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer">✕</button>
        </div>
      }

      @if (errorMessage()) {
        <div class="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg">
          <div class="flex items-center gap-2.5">
            <span class="text-base">⚠️</span>
            <span class="font-medium">{{ errorMessage() }}</span>
          </div>
          <button type="button" (click)="errorMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer">✕</button>
        </div>
      }

      <!-- Section 1: Multi-Competition Tracking Slots -->
      <div class="p-6 rounded-2xl bg-[#16213e] border border-slate-700/60 shadow-xl space-y-6">
        <div class="border-b border-slate-700/50 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#EAE905]">🌐</span>
              <span>Tracked VPG Competition Slots</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Specify the 3 VPG tournament slots for RYVL Esports. Slot 1 is active by default (Superliga România). Configure Slots 2 & 3 for upcoming tournaments.
            </p>
          </div>
          <div class="text-[11px] font-mono text-slate-400">
            Active Guild: <span class="text-white font-bold">{{ guildStore.activeGuild()?.name || 'Default' }}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          @for (comp of competitions(); track comp.id || $index) {
            <div
              class="p-5 rounded-xl bg-[#1a1a2e] border transition flex flex-col justify-between space-y-4"
              [class.border-[#EAE905]/40]="selectedCompSlug() === comp.slug"
              [class.border-slate-700/70]="selectedCompSlug() !== comp.slug"
            >
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono font-black text-[#EAE905]">SLOT {{ comp.displayOrder || ($index + 1) }}</span>
                    @if (selectedCompSlug() === comp.slug) {
                      <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#EAE905]/20 text-[#EAE905] border border-[#EAE905]/30">VIEWING</span>
                    }
                  </div>
                  <span
                    class="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold"
                    [ngClass]="comp.active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700/50 text-slate-400 border border-slate-600/40'"
                  >
                    {{ comp.active ? 'ACTIVE' : 'INACTIVE / TBA' }}
                  </span>
                </div>

                <div>
                  <label class="block text-[11px] font-semibold text-slate-400 mb-1">Competition Title</label>
                  <input
                    type="text"
                    [(ngModel)]="comp.name"
                    placeholder="e.g. Superliga România"
                    class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-400 mb-1">VPG League Slug</label>
                    <input
                      type="text"
                      [(ngModel)]="comp.slug"
                      placeholder="e.g. Superliga-Romania"
                      class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#EAE905] transition"
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-400 mb-1">Community Slug</label>
                    <input
                      type="text"
                      [(ngModel)]="comp.communitySlug"
                      placeholder="VPGRoPS5"
                      class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#EAE905] transition"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-400 mb-1">Season</label>
                    <input
                      type="number"
                      [(ngModel)]="comp.season"
                      placeholder="2"
                      class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                    />
                  </div>

                  <div class="pt-4">
                    <label class="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        [(ngModel)]="comp.active"
                        class="rounded border-slate-700 cursor-pointer accent-[#EAE905] w-4 h-4"
                      />
                      <span class="text-xs font-semibold text-slate-300">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  (click)="saveSlot(comp)"
                  [disabled]="isSavingSlot() === comp.id"
                  class="flex-1 py-2 rounded-lg bg-[#EAE905] hover:bg-[#d8d704] !text-black font-extrabold text-xs shadow transition cursor-pointer text-center disabled:opacity-50"
                >
                  @if (isSavingSlot() === comp.id) {
                    <span class="!text-black">Saving...</span>
                  } @else {
                    <span class="!text-black">Save Slot</span>
                  }
                </button>

                @if (comp.active) {
                  <button
                    type="button"
                    (click)="selectCompetition(comp.slug)"
                    class="px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer"
                    [ngClass]="selectedCompSlug() === comp.slug ? 'bg-[#EAE905]/15 border-[#EAE905] text-[#EAE905]' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'"
                  >
                    Select
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Section 2: One-Click Discord Broadcast Control Desk -->
      <div class="p-6 rounded-2xl bg-[#16213e] border border-[#EAE905]/30 shadow-xl space-y-6">
        <div class="border-b border-slate-700/50 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#EAE905]">⚡</span>
              <span>Discord Broadcast Command Desk</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Instantly push formatted RYVL match telemetry, schedules, and campaign records directly to configured Discord channels.
            </p>
          </div>
          <a
            routerLink="/admin/settings"
            class="text-xs font-semibold text-[#5865F2] hover:underline flex items-center gap-1 self-start sm:self-center"
          >
            <span>Configure Default Channels</span>
            <span>&rarr;</span>
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <!-- Action Card 1: Results -->
          <div class="p-5 rounded-xl bg-[#1a1a2e] border border-slate-700/70 space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400 text-lg">🏆</span>
                <h3 class="text-sm font-bold text-white">Broadcast Results</h3>
              </div>
              <p class="text-xs text-slate-400 leading-relaxed">
                Posts recent match outcomes and scores for RYVL Esports to <code>#ryvl-results</code>.
              </p>

              <div class="pt-2">
                <label class="block text-[11px] font-semibold text-slate-400 mb-1">Target Channel</label>
                <select
                  [(ngModel)]="selectedResultsChannel"
                  class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#EAE905]"
                >
                  <option value="">Default (from Settings)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>

            <button
              type="button"
              (click)="postResults()"
              [disabled]="isPostingResults()"
              class="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-wider shadow transition cursor-pointer flex items-center justify-center gap-2"
            >
              @if (isPostingResults()) {
                <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                <span>Dispatching...</span>
              } @else {
                <span>Post to Discord</span>
              }
            </button>
          </div>

          <!-- Action Card 2: Fixtures -->
          <div class="p-5 rounded-xl bg-[#1a1a2e] border border-slate-700/70 space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-[#EAE905] text-lg">📅</span>
                <h3 class="text-sm font-bold text-white">Broadcast Fixtures</h3>
              </div>
              <p class="text-xs text-slate-400 leading-relaxed">
                Posts upcoming scheduled fixtures and kickoff times to <code>#ryvl-fixtures</code>.
              </p>

              <div class="pt-2">
                <label class="block text-[11px] font-semibold text-slate-400 mb-1">Target Channel</label>
                <select
                  [(ngModel)]="selectedFixturesChannel"
                  class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#EAE905]"
                >
                  <option value="">Default (from Settings)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>

            <button
              type="button"
              (click)="postFixtures()"
              [disabled]="isPostingFixtures()"
              class="w-full py-2.5 px-4 rounded-xl bg-[#EAE905] hover:bg-[#d8d704] disabled:opacity-50 !text-black font-extrabold text-xs uppercase tracking-wider shadow transition cursor-pointer flex items-center justify-center gap-2"
            >
              @if (isPostingFixtures()) {
                <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                <span class="!text-black">Dispatching...</span>
              } @else {
                <span class="!text-black">Post to Discord</span>
              }
            </button>
          </div>

          <!-- Action Card 3: Performance & Leaderboard -->
          <div class="p-5 rounded-xl bg-[#1a1a2e] border border-slate-700/70 space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-blue-400 text-lg">📊</span>
                <h3 class="text-sm font-bold text-white">Broadcast Leaderboard</h3>
              </div>
              <p class="text-xs text-slate-400 leading-relaxed">
                Posts the full campaign overview, win rate, goals, and form streak to <code>#ryvl-leaderboards</code>.
              </p>

              <div class="pt-2">
                <label class="block text-[11px] font-semibold text-slate-400 mb-1">Target Channel</label>
                <select
                  [(ngModel)]="selectedLeaderboardChannel"
                  class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#EAE905]"
                >
                  <option value="">Default (from Settings)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>

            <button
              type="button"
              (click)="postLeaderboard()"
              [disabled]="isPostingLeaderboard()"
              class="w-full py-2.5 px-4 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-wider shadow transition cursor-pointer flex items-center justify-center gap-2"
            >
              @if (isPostingLeaderboard()) {
                <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                <span>Dispatching...</span>
              } @else {
                <span>Post to Discord</span>
              }
            </button>
          </div>
        </div>
      </div>

      <!-- Section 3: Live Campaign Telemetry Overview -->
      @if (performance(); as perf) {
        <div class="space-y-6">
          <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <div>
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <span>📈</span>
                <span>Telemetry: {{ perf.stats.competitionName }}</span>
              </h2>
              <p class="text-xs text-slate-400">Live competitive metrics aggregated for {{ perf.teamName }}.</p>
            </div>
            @if (perf.stats.standingsPosition) {
              <div class="px-3 py-1 rounded-xl bg-[#EAE905]/10 border border-[#EAE905]/30 text-xs font-mono font-bold text-[#EAE905]">
                League Rank: #{{ perf.stats.standingsPosition }} / {{ perf.stats.totalTeams || 16 }}
              </div>
            }
          </div>

          <!-- Stat Cards Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-slate-400 uppercase">Matches</div>
              <div class="text-xl font-black text-white">{{ perf.stats.played }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-emerald-400 uppercase">Wins</div>
              <div class="text-xl font-black text-emerald-400">{{ perf.stats.wins }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-slate-400 uppercase">Draws</div>
              <div class="text-xl font-black text-slate-300">{{ perf.stats.draws }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-rose-400 uppercase">Losses</div>
              <div class="text-xl font-black text-rose-400">{{ perf.stats.losses }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-[#EAE905] uppercase">Points</div>
              <div class="text-xl font-black text-[#EAE905]">{{ perf.stats.points }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-cyan-400 uppercase">Win Rate</div>
              <div class="text-xl font-black text-cyan-400">{{ perf.stats.winRate }}%</div>
            </div>
            <div class="p-3.5 rounded-xl bg-[#16213e] border border-slate-700/60 text-center space-y-1">
              <div class="text-[10px] font-mono text-amber-400 uppercase">Clean Sheets</div>
              <div class="text-xl font-black text-amber-400">{{ perf.stats.cleanSheets }}</div>
            </div>
          </div>

          <!-- Matches Preview Tables -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Recent Results -->
            <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-700/60 space-y-4">
              <div class="flex items-center justify-between border-b border-slate-700/50 pb-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span class="text-emerald-400">🟢</span>
                  <span>Recent Match Results</span>
                </h3>
                <span class="text-[11px] font-mono text-slate-400">{{ perf.recentResults.length }} recorded</span>
              </div>

              <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                @for (m of perf.recentResults; track m.id) {
                  <div class="p-3 rounded-xl bg-[#1a1a2e] border border-slate-700/70 flex items-center justify-between text-xs">
                    <div class="min-w-0">
                      <div class="font-bold text-white truncate">
                        {{ m.homeName }} vs {{ m.awayName }}
                      </div>
                      <div class="text-[10px] text-slate-400 mt-0.5">
                        MD {{ m.matchDay }} • {{ m.dateFormattedEn || m.dateFormattedRo }}
                      </div>
                    </div>
                    <div class="px-2.5 py-1 rounded bg-[#16213e] border border-slate-700 font-mono font-black text-white shrink-0 ml-3">
                      {{ m.homeScore }} : {{ m.awayScore }}
                    </div>
                  </div>
                } @empty {
                  <div class="text-xs text-slate-400 p-4 text-center">No recent results found for this competition.</div>
                }
              </div>
            </div>

            <!-- Upcoming Fixtures -->
            <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-700/60 space-y-4">
              <div class="flex items-center justify-between border-b border-slate-700/50 pb-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span class="text-[#EAE905]">📅</span>
                  <span>Upcoming Scheduled Matches</span>
                </h3>
                <span class="text-[11px] font-mono text-slate-400">{{ perf.upcomingFixtures.length }} scheduled</span>
              </div>

              <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                @for (f of perf.upcomingFixtures; track f.id) {
                  <div class="p-3 rounded-xl bg-[#1a1a2e] border border-slate-700/70 flex items-center justify-between text-xs">
                    <div class="min-w-0">
                      <div class="font-bold text-white truncate">
                        {{ f.homeName }} vs {{ f.awayName }}
                      </div>
                      <div class="text-[10px] text-slate-400 mt-0.5">
                        MD {{ f.matchDay }} • {{ f.dateFormattedEn || f.dateFormattedRo }}
                      </div>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30 shrink-0 ml-3">
                      SCHEDULED
                    </span>
                  </div>
                } @empty {
                  <div class="text-xs text-slate-400 p-4 text-center">No upcoming fixtures scheduled for this competition.</div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminPerformanceComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly isLoading = signal<boolean>(false);
  readonly isSavingSlot = signal<string | null>(null);
  readonly isPostingResults = signal<boolean>(false);
  readonly isPostingFixtures = signal<boolean>(false);
  readonly isPostingLeaderboard = signal<boolean>(false);

  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly competitions = signal<RyvlCompetition[]>([]);
  readonly performance = signal<RyvlPerformanceResponse | null>(null);
  readonly selectedCompSlug = signal<string | null>(null);

  selectedResultsChannel = '';
  selectedFixturesChannel = '';
  selectedLeaderboardChannel = '';

  readonly channels = computed(() => this.guildStore.activeGuild()?.channels ?? []);

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) {
        this.reloadAll(gid);
      }
    });
  }

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      this.reloadAll(gid);
    }
  }

  async reloadAll(guildId?: string): Promise<void> {
    const gid = guildId || this.guildStore.activeGuildId();
    if (!gid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await Promise.all([
        this.loadCompetitions(gid),
        this.loadPerformance(gid, this.selectedCompSlug() || undefined),
      ]);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to load telemetry.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCompetitions(guildId: string): Promise<void> {
    try {
      const res = await this.api.getCompetitions(guildId);
      const comps = res.competitions || [];
      this.competitions.set(comps);
      if (!this.selectedCompSlug() && comps.length > 0) {
        const active = comps.find((c) => c.active) || comps[0];
        this.selectedCompSlug.set(active.slug);
      }
    } catch (err: any) {
      console.warn('Could not load competitions:', err);
    }
  }

  async loadPerformance(guildId: string, compSlug?: string): Promise<void> {
    try {
      const data = await this.api.getRyvlPerformance(compSlug, guildId);
      this.performance.set(data);
    } catch (err: any) {
      console.warn('Could not load RYVL performance telemetry:', err);
    }
  }

  selectCompetition(slug: string): void {
    this.selectedCompSlug.set(slug);
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      this.loadPerformance(gid, slug);
    }
  }

  async saveSlot(comp: RyvlCompetition): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (!gid || !comp.id) return;

    this.isSavingSlot.set(comp.id);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    try {
      await this.api.updateCompetition(gid, comp.id, {
        name: comp.name,
        slug: comp.slug,
        communitySlug: comp.communitySlug || 'VPGRoPS5',
        season: Number(comp.season) || undefined,
        active: Boolean(comp.active),
      });

      this.successMessage.set(`Updated slot: "${comp.name}"`);
      await this.loadCompetitions(gid);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to save competition slot.');
    } finally {
      this.isSavingSlot.set(null);
    }
  }

  async postResults(): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (!gid) return;

    this.isPostingResults.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    try {
      const res = await this.api.postRyvlResults(gid, this.selectedResultsChannel || undefined);
      if (res.success) {
        this.successMessage.set(res.message);
      } else {
        this.errorMessage.set(res.message || 'Failed to post RYVL results.');
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to post RYVL results.');
    } finally {
      this.isPostingResults.set(false);
    }
  }

  async postFixtures(): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (!gid) return;

    this.isPostingFixtures.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    try {
      const res = await this.api.postRyvlFixtures(gid, this.selectedFixturesChannel || undefined);
      if (res.success) {
        this.successMessage.set(res.message);
      } else {
        this.errorMessage.set(res.message || 'Failed to post RYVL fixtures.');
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to post RYVL fixtures.');
    } finally {
      this.isPostingFixtures.set(false);
    }
  }

  async postLeaderboard(): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (!gid) return;

    this.isPostingLeaderboard.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    try {
      const res = await this.api.postRyvlLeaderboard(gid, this.selectedLeaderboardChannel || undefined);
      if (res.success) {
        this.successMessage.set(res.message);
      } else {
        this.errorMessage.set(res.message || 'Failed to post RYVL leaderboard overview.');
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to post RYVL leaderboard overview.');
    } finally {
      this.isPostingLeaderboard.set(false);
    }
  }
}
