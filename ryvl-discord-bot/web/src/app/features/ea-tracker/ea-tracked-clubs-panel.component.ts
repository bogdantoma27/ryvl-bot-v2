import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EaToast } from './ea-player-links-panel.component';
import { EA_DEFAULT_CREST, formatEaTimestamp } from './shared/ea-format';

export type EaTrackerTab = 'clubs' | 'matches' | 'roster' | 'players';

/** "Tracked Clubs" tab: list with Elo and stored-match stats, channel/status controls, search & add. */
@Component({
  selector: 'app-ea-tracked-clubs-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <!-- Overview Card -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>🛡️</span>
              <span>Multi-Club EA FC Pro Clubs Tracker</span>
            </h3>
            <p class="text-xs text-slate-400 mt-1">
              Track multiple clubs concurrently. Each club can announce into its own channel, or fall back to the
              <a routerLink="/admin/server" [queryParams]="{ tab: 'channels' }" class="text-emerald-400 hover:underline font-medium">Superliga results channel</a> set on the Channels tab.
              Elo uses K=32 against the opponent's Elo (1200 for clubs this server does not track).
            </p>
          </div>
          <span class="text-xs bg-[#11192e] border border-slate-700 px-3 py-1.5 rounded-xl text-emerald-400 font-bold">
            {{ trackedClubs().length }} Clubs Active
          </span>
        </div>

        @if (isLoading()) {
          <div class="py-12 text-center text-slate-400 space-y-2">
            <div class="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs">Loading tracked clubs...</p>
          </div>
        } @else if (trackedClubs().length === 0) {
          <div class="p-8 text-center text-slate-400 space-y-2 bg-[#11192e] rounded-xl border border-slate-800">
            <div class="text-3xl">⚽</div>
            <h4 class="text-sm font-bold text-white">No Additional Tracked Clubs</h4>
            <p class="text-xs text-slate-400">Add another EA FC 27 Pro Club below to track and auto-announce matches in dedicated Discord channels.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-[#11192e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                <tr>
                  <th class="py-3 px-4">Club Name / ID</th>
                  <th class="py-3 px-4 text-center">Platform</th>
                  <th class="py-3 px-4 text-center">Elo</th>
                  <th class="py-3 px-4">Target Channel</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                @for (tc of trackedClubs(); track tc.id) {
                  <tr class="hover:bg-slate-800/30 transition">
                    <td class="py-3 px-4">
                      <div class="font-bold text-white flex items-center gap-2">
                        <span>{{ tc.clubName || 'Unknown Club' }}</span>
                        @if (tc.isPrimary) {
                          <span class="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">Primary</span>
                        }
                        @if (tc.clubId === activeClubId()) {
                          <span class="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">Viewing</span>
                        }
                      </div>
                      <div class="font-mono text-[10px] text-slate-400">ID: {{ tc.clubId }}</div>
                    </td>
                    <td class="py-3 px-4 text-center font-mono text-slate-300">
                      <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] border border-slate-700">
                        {{ tc.platform || 'common-gen5' }}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-center font-extrabold text-amber-400 tabular-nums">{{ tc.elo ?? 1200 }}</td>
                    <td class="py-3 px-4">
                      <select
                        [ngModel]="tc.channelId || null"
                        (ngModelChange)="onUpdateClubChannel(tc, $event)"
                        class="bg-[#11192e] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option [ngValue]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Channels)' : '(Superliga results channel)' }}</option>
                        @for (c of availableChannels(); track c.id) {
                          <option [ngValue]="c.id"># {{ c.name }}</option>
                        }
                      </select>
                    </td>
                    <td class="py-3 px-4 text-center">
                      <button
                        type="button"
                        (click)="onToggleClubStatus(tc)"
                        class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border"
                        [ngClass]="tc.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'"
                      >
                        {{ tc.enabled ? '● Active' : '○ Paused' }}
                      </button>
                    </td>
                    <td class="py-3 px-4 text-right">
                      <div class="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          type="button"
                          (click)="toggleStats(tc)"
                          class="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/30 transition cursor-pointer"
                          title="Record, goals and top scorers from tracked matches"
                        >
                          📊 Stats
                        </button>
                        <button
                          type="button"
                          (click)="view.emit({ club: tc, tab: 'matches' })"
                          class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 transition cursor-pointer"
                          title="View recent match scorecard & timeline"
                        >
                          ⚽ Matches
                        </button>
                        <button
                          type="button"
                          (click)="view.emit({ club: tc, tab: 'roster' })"
                          class="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-500/30 transition cursor-pointer"
                          title="View player squad roster & stats"
                        >
                          👥 Squad
                        </button>
                        <button
                          type="button"
                          (click)="view.emit({ club: tc, tab: 'players' })"
                          class="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30 transition cursor-pointer"
                          title="View linked Discord registrations"
                        >
                          🎮 Players
                        </button>
                        @if (isAdmin() && !tc.isPrimary) {
                          <button
                            type="button"
                            (click)="onDeleteTrackedClub(tc.clubId)"
                            class="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition cursor-pointer ml-1"
                            title="Remove tracked club"
                          >
                            ✕
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- Stored-match statistics for one club -->
        @if (statsClubId()) {
          <div class="bg-[#11192e] border border-slate-800 rounded-xl p-4 space-y-3">
            @if (isLoadingStats()) {
              <div class="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <span class="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Loading club statistics...</span>
              </div>
            } @else if (clubStats(); as s) {
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 class="text-sm font-bold text-white">{{ s.clubName }} — Tracked Match Stats</h4>
                  <p class="text-[11px] text-slate-400">
                    Last {{ s.totalMatches }} match(es) recorded by the bot (up to {{ s.matchWindow || 50 }}).
                  </p>
                </div>
                <button type="button" (click)="statsClubId.set(null)" class="text-xs text-slate-400 hover:text-white cursor-pointer">✕ Close</button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                  <div class="text-slate-400 text-[10px] uppercase font-bold">Elo</div>
                  <div class="text-sm font-black text-amber-400 mt-1">{{ s.elo }}</div>
                </div>
                <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                  <div class="text-slate-400 text-[10px] uppercase font-bold">Record</div>
                  <div class="text-sm font-black text-white mt-1">{{ s.wins }}W - {{ s.draws }}D - {{ s.losses }}L</div>
                  <div class="text-[10px] text-emerald-400 font-semibold">{{ s.winRate }}% Win Rate</div>
                </div>
                <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                  <div class="text-slate-400 text-[10px] uppercase font-bold">Goals</div>
                  <div class="text-sm font-black text-emerald-400 mt-1">{{ s.goalsFor }} : {{ s.goalsAgainst }}</div>
                  <div class="text-[10px] text-slate-400">GD {{ s.goalDifference >= 0 ? '+' : '' }}{{ s.goalDifference }}</div>
                </div>
                <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                  <div class="text-slate-400 text-[10px] uppercase font-bold">Clean Sheets</div>
                  <div class="text-sm font-black text-sky-400 mt-1">{{ s.cleanSheets }}</div>
                </div>
                <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                  <div class="text-slate-400 text-[10px] uppercase font-bold">Top Scorers</div>
                  @for (p of s.topScorers; track p.name) {
                    <div class="text-[11px] text-white mt-1 truncate">{{ p.name }} <span class="text-emerald-400 font-bold">{{ p.goals }}</span><span class="text-slate-500"> / {{ p.assists }}A</span></div>
                  } @empty {
                    <div class="text-[11px] text-slate-500 mt-1">No player stats yet</div>
                  }
                </div>
              </div>
              @if (s.recentMatches?.length) {
                <div class="space-y-1">
                  @for (m of s.recentMatches; track m.eaMatchId) {
                    <div class="flex items-center justify-between text-[11px] text-slate-300 bg-[#16213e] border border-slate-800 rounded-lg px-3 py-1.5">
                      <span class="truncate">{{ m.homeClubName }} <strong class="text-white">{{ m.homeScore }} : {{ m.awayScore }}</strong> {{ m.awayClubName }}</span>
                      <span class="text-slate-500 shrink-0 ml-2">{{ formatTimestamp(m.timestamp) }}</span>
                    </div>
                  }
                </div>
              }
            } @else {
              <p class="text-xs text-rose-300">Club statistics could not be loaded.</p>
            }
          </div>
        }
      </div>

      <!-- Add Club to Tracker Card -->
      @if (isAdmin()) {
        <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div class="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🔍</span>
                <span>Search & Add Club to Tracker</span>
              </h3>
              <p class="text-xs text-slate-400 mt-1">Search the official EA Clubs directory by name to add and track live stats, match results, and automated announcements.</p>
            </div>
            <button
              type="button"
              (click)="showManualAdd.set(!showManualAdd())"
              class="text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 cursor-pointer"
            >
              <span>{{ showManualAdd() ? '✕ Close Manual Input' : '✏️ Or Enter Club ID' }}</span>
            </button>
          </div>

          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="relative flex-1">
                <input
                  type="text"
                  [ngModel]="searchQuery()"
                  (ngModelChange)="searchQuery.set($event)"
                  (keydown.enter)="searchClubs()"
                  placeholder="Enter club name (e.g. RYVL, FC Barcelona, Milano...)"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
                @if (searchQuery()) {
                  <button
                    type="button"
                    (click)="searchQuery.set(''); searchResults.set([]); hasSearched.set(false)"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                }
              </div>

              <button
                type="button"
                (click)="searchClubs()"
                [disabled]="isSearching() || !searchQuery().trim()"
                class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                @if (isSearching()) {
                  <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  <span>Searching EA...</span>
                } @else {
                  <span>Search EA API</span>
                }
              </button>
            </div>

            @if (isSearching()) {
              <div class="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-[#11192e]/60 rounded-xl border border-slate-800">
                <span class="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Querying EA Sports Clubs database...</span>
              </div>
            } @else if (hasSearched()) {
              @if (searchResults().length === 0) {
                <div class="py-8 text-center text-slate-400 text-xs bg-[#11192e]/60 rounded-xl border border-slate-800">
                  No clubs found for "<span class="text-white font-medium">{{ searchQuery() }}</span>". Check the spelling or enter the Club ID manually below.
                </div>
              } @else {
                <div class="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    Found {{ searchResults().length }} club(s)
                  </div>

                  @for (club of searchResults(); track club.clubId) {
                    <div class="bg-[#11192e] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div class="flex items-center gap-3.5 min-w-0">
                        <img
                          [src]="club.crestUrl || defaultCrest"
                          [alt]="club.name"
                          (error)="onCrestError($event)"
                          class="w-12 h-12 object-contain rounded-lg bg-black/30 p-1 border border-slate-800 shrink-0"
                        />
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-extrabold text-sm text-white truncate">{{ club.name }}</span>
                            @if (isTracked(club.clubId)) {
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                Already Tracked
                              </span>
                            }
                          </div>
                          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1">
                            <span class="font-mono text-slate-500">ID: {{ club.clubId }}</span>
                            @if (club.currentDivision) {
                              <span class="text-amber-400 font-semibold">{{ club.currentDivision }}</span>
                            }
                            <span>Record: <strong class="text-emerald-400">{{ club.wins || 0 }}W</strong> - <strong class="text-slate-300">{{ club.ties || 0 }}D</strong> - <strong class="text-rose-400">{{ club.losses || 0 }}L</strong></span>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
                        <div class="min-w-[190px]">
                          <label class="block text-[10px] font-semibold text-slate-400 mb-1">Target Channel</label>
                          <select
                            [ngModel]="selectedChannelForClub(club.clubId)"
                            (ngModelChange)="setSelectedChannelForClub(club.clubId, $event)"
                            class="w-full bg-[#0d1424] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option [ngValue]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Channels)' : '(Superliga results channel)' }}</option>
                            @for (c of availableChannels(); track c.id) {
                              <option [ngValue]="c.id"># {{ c.name }}</option>
                            }
                          </select>
                        </div>

                        <div class="pt-3.5">
                          @if (isTracked(club.clubId)) {
                            <button
                              type="button"
                              (click)="viewById(club.clubId)"
                              class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs border border-emerald-500/30 transition cursor-pointer"
                            >
                              View Club
                            </button>
                          } @else {
                            <button
                              type="button"
                              (click)="addClubFromSearch(club)"
                              [disabled]="isAddingClub()"
                              class="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-md transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              + Track Club
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              }
            }
          </div>

          @if (showManualAdd()) {
            <div class="border-t border-slate-800/80 pt-4 mt-2 space-y-3 bg-[#11192e]/40 p-4 rounded-xl border border-slate-800">
              <div class="text-xs font-bold text-slate-300 flex items-center gap-2">
                <span>Manual Club Registration</span>
                <span class="text-[10px] font-normal text-slate-500">(Use if club is not appearing in EA search)</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-300 mb-1">Club ID</label>
                  <input
                    type="text"
                    [(ngModel)]="newClubId"
                    placeholder="e.g. 128199"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-300 mb-1">Club Name</label>
                  <input
                    type="text"
                    [(ngModel)]="newClubName"
                    placeholder="e.g. RYVL Esports"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-300 mb-1">Platform</label>
                  <select
                    [(ngModel)]="newClubPlatform"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="common-gen5">common-gen5 (PS5 / Xbox Series / PC)</option>
                    <option value="common-gen4">common-gen4 (PS4 / Xbox One)</option>
                    <option value="nx">nx (Switch)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-300 mb-1">Target Discord Channel</label>
                  <select
                    [(ngModel)]="newClubChannelId"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option [ngValue]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Channels)' : '(Superliga results channel)' }}</option>
                    @for (c of availableChannels(); track c.id) {
                      <option [ngValue]="c.id"># {{ c.name }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="flex justify-end pt-1">
                <button
                  type="button"
                  (click)="onAddTrackedClub()"
                  [disabled]="isAddingClub() || !newClubId || !newClubName"
                  class="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  @if (isAddingClub()) {
                    <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span>Adding Club...</span>
                  } @else {
                    <span>Add Tracked Club</span>
                  }
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class EaTrackedClubsPanelComponent {
  private readonly api = inject(ApiService);

  readonly guildId = input.required<string>();
  readonly trackedClubs = input<any[]>([]);
  readonly isLoading = input(false);
  readonly activeClubId = input<string>('');
  readonly isAdmin = input(false);
  readonly availableChannels = input<any[]>([]);
  readonly defaultLiveResultsChannelName = input<string | null>(null);
  /** Channel preselected for a search result (the guild's default results channel). */
  readonly defaultChannelId = input<string | null>(null);

  /** Emitted after a club was added, changed or removed so the parent reloads. */
  readonly changed = output<void>();
  readonly view = output<{ club: any; tab: EaTrackerTab }>();
  readonly toast = output<EaToast>();

  readonly defaultCrest = EA_DEFAULT_CREST;
  readonly formatTimestamp = formatEaTimestamp;

  readonly isAddingClub = signal(false);
  readonly isSearching = signal(false);
  readonly hasSearched = signal(false);
  readonly showManualAdd = signal(false);
  readonly searchClubChannels = signal<Record<string, string | null>>({});
  readonly searchQuery = signal('');
  readonly searchResults = signal<any[]>([]);

  readonly statsClubId = signal<string | null>(null);
  readonly clubStats = signal<any>(null);
  readonly isLoadingStats = signal(false);

  newClubId = '';
  newClubName = '';
  newClubPlatform = 'common-gen5';
  newClubChannelId: string | null = null;

  async toggleStats(club: any): Promise<void> {
    if (this.statsClubId() === club.clubId) {
      this.statsClubId.set(null);
      return;
    }
    this.statsClubId.set(club.clubId);
    this.clubStats.set(null);
    this.isLoadingStats.set(true);
    try {
      const stats = await this.api.getClubStats(this.guildId(), club.clubId);
      if (this.statsClubId() === club.clubId) this.clubStats.set(stats);
    } catch (err) {
      console.error('Failed to load club stats:', err);
    } finally {
      if (this.statsClubId() === club.clubId) this.isLoadingStats.set(false);
    }
  }

  onCrestError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) target.src = this.defaultCrest;
  }

  selectedChannelForClub(clubId: string | number): string | null {
    const id = String(clubId);
    const chosen = this.searchClubChannels()[id];
    return chosen !== undefined ? chosen : this.defaultChannelId();
  }

  setSelectedChannelForClub(clubId: string | number, channelId: string | null): void {
    const id = String(clubId);
    this.searchClubChannels.update((prev) => ({ ...prev, [id]: channelId }));
  }

  isTracked(clubId: string | number): boolean {
    return this.trackedClubs().some((c) => String(c.clubId) === String(clubId));
  }

  viewById(clubId: string): void {
    const club = this.trackedClubs().find((c) => String(c.clubId) === String(clubId));
    if (club) this.view.emit({ club, tab: 'matches' });
  }

  async searchClubs(): Promise<void> {
    const guildId = this.guildId();
    const query = this.searchQuery().trim();
    if (!guildId || !query) return;

    this.isSearching.set(true);
    this.hasSearched.set(true);
    try {
      const results = await this.api.searchEaClubs(guildId, query);
      this.searchResults.set(results || []);
    } catch (err: any) {
      this.toast.emit({ text: `Search failed: ${err.message}`, type: 'error' });
    } finally {
      this.isSearching.set(false);
    }
  }

  async addClubFromSearch(club: any): Promise<void> {
    const guildId = this.guildId();
    if (!guildId) return;

    const channelId = this.selectedChannelForClub(club.clubId);
    this.isAddingClub.set(true);
    try {
      await this.api.addTrackedClub(guildId, {
        clubId: String(club.clubId),
        clubName: club.name,
        platform: 'common-gen5',
        channelId: channelId || undefined,
        enabled: true,
      });
      this.toast.emit({ text: `Club "${club.name}" added to tracker!`, type: 'success' });
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: `Failed to add club: ${err.message}`, type: 'error' });
    } finally {
      this.isAddingClub.set(false);
    }
  }

  async onAddTrackedClub(): Promise<void> {
    const guildId = this.guildId();
    if (!guildId || !this.newClubId.trim() || !this.newClubName.trim()) return;

    this.isAddingClub.set(true);
    try {
      await this.api.addTrackedClub(guildId, {
        clubId: this.newClubId.trim(),
        clubName: this.newClubName.trim(),
        platform: this.newClubPlatform,
        channelId: this.newClubChannelId || undefined,
        enabled: true,
      });
      this.toast.emit({ text: `Club "${this.newClubName}" added to tracker!`, type: 'success' });
      this.newClubId = '';
      this.newClubName = '';
      this.newClubChannelId = null;
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: `Failed to add club: ${err.message}`, type: 'error' });
    } finally {
      this.isAddingClub.set(false);
    }
  }

  async onUpdateClubChannel(club: any, channelId: string | null): Promise<void> {
    const guildId = this.guildId();
    if (!guildId) return;

    try {
      // null = "Default": the server resolves it to the guild's results channel.
      await this.api.updateTrackedClub(guildId, club.clubId, { channelId: channelId || null });
      this.toast.emit({ text: 'Club announcement channel updated.', type: 'success' });
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: `Failed to update channel: ${err.message}`, type: 'error' });
    }
  }

  async onToggleClubStatus(club: any): Promise<void> {
    const guildId = this.guildId();
    if (!guildId) return;

    try {
      await this.api.updateTrackedClub(guildId, club.clubId, { enabled: !club.enabled });
      this.toast.emit({ text: `Club tracking ${!club.enabled ? 'activated' : 'paused'}.`, type: 'success' });
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: `Failed to toggle status: ${err.message}`, type: 'error' });
    }
  }

  async onDeleteTrackedClub(clubId: string): Promise<void> {
    const guildId = this.guildId();
    if (!guildId) return;

    try {
      await this.api.removeTrackedClub(guildId, clubId);
      this.toast.emit({ text: 'Tracked club removed.', type: 'success' });
      if (this.statsClubId() === clubId) this.statsClubId.set(null);
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: `Failed to remove club: ${err.message}`, type: 'error' });
    }
  }
}
