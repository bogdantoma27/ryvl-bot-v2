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
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { RegisteredDiscordPlayer, PlayerRegistrationAudit } from '../../core/models';
import { EaMatchCardComponent } from './shared/ea-match-card.component';
import { EaMemberTableComponent } from './shared/ea-member-table.component';
import { EA_DEFAULT_CREST } from './shared/ea-format';
import { EaPlayerLinksPanelComponent, EaToast } from './ea-player-links-panel.component';
import { EaTrackedClubsPanelComponent, EaTrackerTab } from './ea-tracked-clubs-panel.component';
import { EaPlayerStatsModalComponent } from './ea-player-stats-modal.component';

@Component({
  selector: 'app-ea-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    EaMatchCardComponent,
    EaMemberTableComponent,
    EaPlayerLinksPanelComponent,
    EaTrackedClubsPanelComponent,
    EaPlayerStatsModalComponent,
  ],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 pb-12">
      <!-- Toast Notification -->
      @if (toast()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all transform animate-bounce"
          [ngClass]="toast()!.type === 'error' ? 'bg-rose-900 border border-rose-600 text-rose-100' : 'bg-emerald-900 border border-emerald-600 text-emerald-100'"
        >
          <span>{{ toast()!.text }}</span>
          <button (click)="toast.set(null)" class="text-xs opacity-75 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      }

      <!-- Page Header & Club Hero Banner -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#1a274a] to-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-[#00d26a]/5 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div class="flex items-center gap-5">
            <!-- Club Crest -->
            <div class="w-20 h-20 rounded-2xl bg-[#0f172a] border-2 border-slate-700/80 p-2 flex items-center justify-center shrink-0 shadow-lg">
              @if (clubCrestUrl()) {
                <img [src]="clubCrestUrl()" alt="Crest" class="w-full h-full object-contain" />
              } @else {
                <div class="text-2xl font-black text-emerald-400">FC</div>
              }
            </div>

            <div>
              <div class="flex items-center gap-3 flex-wrap">
                <h1 class="text-2xl font-black text-white tracking-tight">
                  {{ clubName() }}
                </h1>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {{ platform() }}
                </span>
                @if (config()?.enabled) {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-600 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Auto-Tracker Active
                  </span>
                } @else {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    Tracker Paused
                  </span>
                }
              </div>
              <p class="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>Club ID: <code class="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">{{ clubId() }}</code></span>
                <span>•</span>
                <span>Target Channel:
                  @if (targetChannelName()) {
                    <span class="text-indigo-400 font-medium">#{{ targetChannelName() }}</span>
                  } @else {
                    <span class="text-amber-400 italic">Not configured</span>
                  }
                </span>
                @if (trackedClubs().length > 1) {
                  <span>•</span>
                  <span class="flex items-center gap-1.5">
                    <span class="text-slate-400 font-semibold">Switch Club:</span>
                    <select
                      [ngModel]="clubId()"
                      (ngModelChange)="switchActiveClubById($event)"
                      class="bg-[#11192e] border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      @for (tc of trackedClubs(); track tc.id) {
                        <option [value]="tc.clubId">{{ tc.clubName || tc.clubId }}</option>
                      }
                    </select>
                  </span>
                }
              </p>
            </div>
          </div>

          <!-- Hero Action Controls -->
          <div class="flex items-center gap-2.5 flex-wrap">
            @if (isAdmin()) {
              <button
                type="button"
                (click)="postLatestMatch()"
                [disabled]="isActionRunning()"
                class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>Post Latest to Discord</span>
              </button>
            }

            <button
              type="button"
              (click)="pollNow()"
              [disabled]="isActionRunning()"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1f2e54] hover:bg-[#283b6b] text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <svg class="w-4 h-4" [class.animate-spin]="isActionRunning()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ isAdmin() ? 'Check New Matches' : 'Refresh Stats' }}</span>
            </button>

            @if (isAdmin()) {
              <button
                type="button"
                (click)="activeTab.set('clubs')"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Tracked Clubs</span>
              </button>
            }
          </div>
        </div>

        <!-- Metric Badges Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Record</div>
            <div class="text-base font-extrabold text-white mt-1">
              {{ wins() }}W - {{ ties() }}D - {{ losses() }}L
            </div>
            <div class="text-[11px] text-emerald-400 font-semibold">{{ winRate() }}% Win Rate</div>
          </div>

          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Skill Rating</div>
            <div class="text-base font-extrabold text-indigo-400 mt-1">
              {{ skillRating() }}
            </div>
            <div class="text-[11px] text-slate-400">Best Div: {{ bestDivision() }}</div>
          </div>

          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Goals Scored</div>
            <div class="text-base font-extrabold text-emerald-400 mt-1">
              {{ goals() }}
            </div>
            <div class="text-[11px] text-slate-400">Conceded: {{ goalsAgainst() }}</div>
          </div>

          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Goal Diff</div>
            <div class="text-base font-extrabold mt-1" [ngClass]="goalDiff() >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              {{ goalDiff() >= 0 ? '+' : '' }}{{ goalDiff() }}
            </div>
            <div class="text-[11px] text-slate-400">{{ totalMatches() }} Matches</div>
          </div>

          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clean Sheets</div>
            <div class="text-base font-extrabold text-sky-400 mt-1">
              {{ cleanSheets() }}
            </div>
            <div class="text-[11px] text-slate-400">Shutouts</div>
          </div>

          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800/80">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check Interval</div>
            <div class="text-base font-extrabold text-slate-200 mt-1">
              {{ pollIntervalSec() }}s
            </div>
            <div class="text-[11px] text-slate-400">Auto Background</div>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          type="button"
          (click)="onSelectTab('clubs')"
          class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
          [ngClass]="activeTab() === 'clubs' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
        >
          <span>🛡️</span>
          <span>Tracked Clubs ({{ trackedClubs().length }})</span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('matches')"
          class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
          [ngClass]="activeTab() === 'matches' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
        >
          <span>⚽</span>
          <span>Recent Matches ({{ matches().length }})</span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('roster')"
          class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
          [ngClass]="activeTab() === 'roster' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
        >
          <span>👥</span>
          <span>Squad & Member Stats ({{ members().length }})</span>
        </button>

        @if (isAdmin()) {
          <button
            type="button"
            (click)="onSelectTab('players')"
            class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            [ngClass]="activeTab() === 'players' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
          >
            <span>🎮</span>
            <span>Registered Players ({{ registeredPlayers().length }})</span>
          </button>
        }
      </div>

      <!-- Tab 1: Recent Matches -->
      @if (activeTab() === 'matches') {
        @if (isLoadingMatches()) {
          <div class="py-16 text-center text-slate-400 space-y-3">
            <div class="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs font-medium">Fetching recent matches from EA SPORTS FC 27 Pro Clubs servers...</p>
          </div>
        } @else if (matches().length === 0) {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">⚽</div>
            <h3 class="text-base font-bold text-white">No Matches Found</h3>
            <p class="text-xs max-w-sm mx-auto">We couldn't find any recent matches recorded for this club. Once a game is played, it will appear here automatically.</p>
          </div>
        } @else {
          <div class="space-y-4">
            @for (match of matches(); track match.matchId) {
              <app-ea-match-card
                [match]="match"
                theme="admin"
                [expanded]="expandedMatchId() === match.matchId"
                (toggle)="toggleExpandMatch($event)"
              />
            }
          </div>
        }
      }

      <!-- Tab 2: Squad & Member Stats -->
      @if (activeTab() === 'roster') {
        @if (isLoadingMembers()) {
          <div class="py-16 text-center text-slate-400 space-y-3">
            <div class="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs font-medium">Loading club roster and individual statistics...</p>
          </div>
        } @else if (members().length === 0) {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">👥</div>
            <h3 class="text-base font-bold text-white">No Member Records Found</h3>
            <p class="text-xs max-w-sm mx-auto">Could not fetch member stats for club {{ clubName() }}.</p>
          </div>
        } @else {
          <app-ea-member-table
            [members]="members()"
            theme="admin"
            heading="Club Roster & Leaderboard"
            [subheading]="'All-time member performance statistics for ' + clubName()"
          />
        }
      }

      <!-- Tab: Registered Players -->
      @if (isAdmin() && activeTab() === 'players') {
        <app-ea-player-links-panel
          [guildId]="activeGuildId()"
          [registeredPlayers]="registeredPlayers()"
          [auditLogs]="auditLogs()"
          [isLoading]="isLoadingPlayers()"
          [guildMembers]="guildMembers()"
          (changed)="loadRegisteredPlayers(activeGuildId())"
          (viewStats)="viewPlayerStats($event)"
          (toast)="showToast($event.text, $event.type)"
        />
      }

      <!-- Tab: Multi-Club EA Tracker -->
      @if (activeTab() === 'clubs') {
        <app-ea-tracked-clubs-panel
          [guildId]="activeGuildId()"
          [trackedClubs]="trackedClubs()"
          [isLoading]="isLoadingTrackedClubs()"
          [activeClubId]="clubId()"
          [isAdmin]="isAdmin()"
          [availableChannels]="availableChannels()"
          [defaultLiveResultsChannelName]="defaultLiveResultsChannelName()"
          [defaultChannelId]="defaultResultsChannelId()"
          (changed)="loadTrackedClubs(activeGuildId())"
          (view)="switchActiveClubTo($event.club, $event.tab)"
          (toast)="showToast($event.text, $event.type)"
        />
      }

      <!-- Player Stats Modal -->
      @if (playerStatsData()) {
        <app-ea-player-stats-modal [stats]="playerStatsData()" (closed)="playerStatsData.set(null)" />
      }
    </div>
  `,
})
export class EaTrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly guildStore = inject(GuildStore);

  readonly isAdmin = computed(() => Boolean(this.api.getSessionToken()));

  readonly defaultCrest = EA_DEFAULT_CREST;

  // State
  readonly activeTab = signal<EaTrackerTab>('clubs');
  readonly config = signal<any>(null);
  readonly clubInfo = signal<any>(null);
  readonly overallStats = signal<any>(null);
  readonly matches = signal<any[]>([]);
  readonly members = signal<any[]>([]);
  readonly registeredPlayers = signal<RegisteredDiscordPlayer[]>([]);
  readonly auditLogs = signal<PlayerRegistrationAudit[]>([]);
  readonly isLoadingPlayers = signal<boolean>(false);
  readonly playerStatsData = signal<any>(null);

  readonly trackedClubs = signal<any[]>([]);
  readonly isLoadingTrackedClubs = signal<boolean>(false);

  readonly isLoadingMatches = signal<boolean>(false);
  readonly isLoadingMembers = signal<boolean>(false);
  readonly isActionRunning = signal<boolean>(false);
  readonly toast = signal<EaToast | null>(null);

  readonly expandedMatchId = signal<string | null>(null);

  // Computed properties
  readonly clubName = computed(() => this.config()?.clubName || 'RYVL Esports');
  readonly clubId = computed(() => this.config()?.clubId || '128199');
  readonly platform = computed(() => this.config()?.platform || 'common-gen5');
  readonly pollIntervalSec = computed(() => this.config()?.pollIntervalSec || 90);
  readonly activeGuildId = computed(() => this.guildStore.activeGuildId() || '');

  readonly clubCrestUrl = computed(() => {
    const info = this.clubInfo();
    const id = this.clubId();
    const clubData = info?.[id] || info || {};
    const identifier = clubData.teamId || clubData.customKit?.crestAssetId || '22';
    return `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${identifier}.png`;
  });

  readonly availableChannels = computed(() => {
    return this.guildStore.activeGuild()?.channels || [];
  });

  readonly guildMembers = computed(() => {
    return this.guildStore.activeGuild()?.members || [];
  });

  readonly targetChannelName = computed(() => {
    const chId = this.config()?.channelId;
    if (!chId) return null;
    const ch = this.availableChannels().find((c) => c.id === chId);
    return ch ? ch.name : chId;
  });

  readonly defaultLiveResultsChannelName = computed(() => {
    const active = this.guildStore.activeGuild();
    const chId = (active as any)?.defaultLiveResultsChannelId || (active as any)?.settings?.defaultLiveResultsChannelId;
    if (!chId) return null;
    const ch = this.availableChannels().find((c) => c.id === chId);
    return ch ? ch.name : chId;
  });

  readonly defaultResultsChannelId = computed(() => {
    const guild = this.guildStore.activeGuild() as any;
    return guild?.defaultLiveResultsChannelId || guild?.settings?.defaultChannelId || null;
  });

  // Overall Stats Computeds
  private readonly overall = computed(() => {
    const s = this.overallStats();
    return Array.isArray(s) && s.length > 0 ? s[0] : s;
  });
  readonly wins = computed(() => parseInt(String(this.overall()?.wins || 0), 10));
  readonly losses = computed(() => parseInt(String(this.overall()?.losses || 0), 10));
  readonly ties = computed(() => parseInt(String(this.overall()?.ties || 0), 10));
  readonly totalMatches = computed(() => this.wins() + this.losses() + this.ties());
  readonly winRate = computed(() => {
    const total = this.totalMatches();
    return total > 0 ? ((this.wins() / total) * 100).toFixed(1) : '0.0';
  });
  readonly skillRating = computed(() => this.overall()?.skillRating || 'N/A');
  readonly bestDivision = computed(() => {
    const data = this.overall();
    return data?.bestDivision != null ? `Div ${data.bestDivision}` : 'Div 1';
  });
  readonly goals = computed(() => parseInt(String(this.overall()?.goals || 0), 10));
  readonly goalsAgainst = computed(() => parseInt(String(this.overall()?.goalsAgainst || 0), 10));
  readonly goalDiff = computed(() => this.goals() - this.goalsAgainst());
  readonly cleanSheets = computed(() => this.overall()?.cleanSheets || 0);

  private lastLoadedGuildId: string | null = null;

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid && gid !== this.lastLoadedGuildId) {
        this.lastLoadedGuildId = gid;
        void this.loadAllData(gid);
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const queryGid = params.get('guildId');
      if (queryGid && queryGid !== this.guildStore.activeGuildId()) {
        void this.guildStore.setActiveGuild(queryGid);
      }
      const gId = queryGid || this.guildStore.activeGuildId() || 'default';
      const tab = params.get('tab');
      if (tab === 'players' || tab === 'matches' || tab === 'roster' || tab === 'clubs') {
        this.activeTab.set(tab);
      }
      if (gId !== this.lastLoadedGuildId) {
        this.lastLoadedGuildId = gId;
        void this.loadAllData(gId);
      }
    });
  }

  async loadAllData(guildId: string): Promise<void> {
    if (!this.isAdmin() && this.activeTab() === 'players') {
      this.activeTab.set('clubs');
    }

    try {
      const configRes = await this.api.getEaConfig(guildId);
      this.config.set(configRes.config);
      this.clubInfo.set(configRes.clubInfo);
      this.overallStats.set(configRes.overallStats);

      this.loadMatches(guildId);
      this.loadMembers(guildId);

      // Always load tracked clubs for the guild
      if (guildId !== 'default') {
        this.loadTrackedClubs(guildId);
        if (this.isAdmin()) {
          this.loadRegisteredPlayers(guildId);
        }
      }
    } catch (err: any) {
      console.error('Error loading EA config:', err);
    }
  }

  async loadMatches(guildId: string): Promise<void> {
    this.isLoadingMatches.set(true);
    try {
      const list = await this.api.getEaMatches(guildId, 10);
      this.matches.set(list || []);
    } catch (err: any) {
      console.error('Failed to load matches:', err);
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
      console.error('Failed to load members:', err);
    } finally {
      this.isLoadingMembers.set(false);
    }
  }

  toggleExpandMatch(matchId: string): void {
    this.expandedMatchId.set(this.expandedMatchId() === matchId ? null : matchId);
  }

  onSelectTab(tab: EaTrackerTab): void {
    this.activeTab.set(tab);
    const gId = this.guildStore.activeGuildId() || 'default';
    if (tab === 'players') {
      this.loadRegisteredPlayers(gId);
    } else if (tab === 'clubs') {
      this.loadTrackedClubs(gId);
    }
  }

  async selectClub(club: any): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isActionRunning.set(true);
    try {
      const updated = await this.api.updateEaConfig(guildId, {
        clubId: String(club.clubId),
        clubName: club.name,
        ...(club.platform ? { platform: club.platform } : {}),
      });
      this.config.set(updated);
      this.showToast(`Tracked club changed to ${club.name}!`, 'success');
      // Reload overall stats and matches for the new club
      await this.loadAllData(guildId);
    } catch (err: any) {
      this.showToast(`Failed to select club: ${err.message}`, 'error');
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async postLatestMatch(): Promise<void> {
    if (!this.isAdmin()) return;
    const guildId =
      this.config()?.guildId ||
      this.route.snapshot.queryParamMap.get('guildId') ||
      this.guildStore.activeGuildId();
    if (!guildId || guildId === 'default') {
      this.showToast('Select an active server to post match stats.', 'error');
      return;
    }

    this.isActionRunning.set(true);
    try {
      const res = await this.api.postLatestEaMatch(guildId, this.config()?.channelId);
      if (res.success) {
        this.showToast('Latest match statistics posted to Discord channel!', 'success');
      } else {
        this.showToast(res.error || 'Failed to post latest match.', 'error');
      }
    } catch (err: any) {
      this.showToast(`Error: ${err.message}`, 'error');
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async pollNow(): Promise<void> {
    const guildId =
      this.config()?.guildId ||
      this.route.snapshot.queryParamMap.get('guildId') ||
      this.guildStore.activeGuildId() ||
      'default';

    this.isActionRunning.set(true);
    try {
      if (this.isAdmin() && guildId !== 'default') {
        const res = await this.api.pollEaNow(guildId);
        if (res.postedCount > 0) {
          this.showToast(`Found and posted ${res.postedCount} new match(es)!`, 'success');
        } else {
          this.showToast('Checked EA servers: No new matches found.', 'success');
        }
        // Elo and checkpoints of tracked clubs may have changed.
        void this.loadTrackedClubs(guildId);
      } else {
        this.showToast('Refreshed latest club statistics.', 'success');
      }
      await Promise.all([this.loadMatches(guildId), this.loadMembers(guildId)]);
    } catch (err: any) {
      this.showToast(`Refresh failed: ${err.message}`, 'error');
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async loadRegisteredPlayers(guildId: string): Promise<void> {
    if (!guildId || guildId === 'default') return;
    this.isLoadingPlayers.set(true);
    try {
      const [players, audit] = await Promise.all([
        this.api.getRegisteredPlayers(guildId),
        this.api.getPlayerRegistrationAudit(guildId),
      ]);
      this.registeredPlayers.set(players || []);
      this.auditLogs.set(audit || []);
    } catch (err) {
      console.error('Failed to load registered players:', err);
    } finally {
      this.isLoadingPlayers.set(false);
    }
  }

  async viewPlayerStats(identifier: string): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !identifier) return;

    try {
      const stats = await this.api.getPlayerStats(guildId, identifier);
      this.playerStatsData.set(stats);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to fetch player stats.', 'error');
    }
  }

  async loadTrackedClubs(guildId: string): Promise<void> {
    if (!guildId || guildId === 'default') return;
    this.isLoadingTrackedClubs.set(true);
    try {
      const clubs = await this.api.getTrackedClubs(guildId);
      this.trackedClubs.set(clubs || []);
    } catch (err: any) {
      console.error('Failed to load tracked clubs:', err);
    } finally {
      this.isLoadingTrackedClubs.set(false);
    }
  }

  async switchActiveClubTo(club: any, targetTab: EaTrackerTab = 'matches'): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      if (String(club.clubId) !== String(this.clubId())) {
        await this.selectClub({
          clubId: club.clubId,
          name: club.clubName || club.name,
          platform: club.platform,
        });
        await this.loadTrackedClubs(guildId);
      }
      this.activeTab.set(targetTab);
      if (targetTab === 'players' && this.isAdmin()) {
        await this.loadRegisteredPlayers(guildId);
      }
    } catch (err: any) {
      this.showToast(`Failed to switch active club: ${err.message}`, 'error');
    }
  }

  async switchActiveClubById(clubId: string): Promise<void> {
    const club = this.trackedClubs().find((c) => String(c.clubId) === String(clubId));
    if (club) {
      await this.switchActiveClubTo(club, 'matches');
    }
  }

  showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      this.toast.set(null);
    }, 4500);
  }
}
