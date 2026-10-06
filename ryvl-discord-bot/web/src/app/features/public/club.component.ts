import { PublicPageHeaderComponent } from './public-page-header.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { EaMatchCardComponent } from '../ea-tracker/shared/ea-match-card.component';
import { EaMemberTableComponent } from '../ea-tracker/shared/ea-member-table.component';
import { formatEaTimestamp } from '../ea-tracker/shared/ea-format';

@Component({
  selector: 'app-public-club',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, PublicPageHeaderComponent, EaMatchCardComponent, EaMemberTableComponent],
  template: `
    <div class="public-page space-y-8">
      <app-public-page-header heading="RYVL Club Tracker" eyebrow="EA SPORTS FC 27 Pro Clubs">
        <button header-actions type="button" class="public-button" (click)="refreshData()" [disabled]="isLoadingMatches() || isLoadingConfig()">Refresh</button>
      </app-public-page-header>

      <!-- Distinguish outages from a valid empty match/member feed. -->
      @if(errorMessage()) {
        <div class="public-error" role="alert">
          <p>{{ errorMessage() }}</p>
          <button type="button" class="public-button mt-3" (click)="refreshData()" [disabled]="isLoadingConfig()">Try again</button>
        </div>
      }

      <!-- Club Showcase Hero Card -->
      <div class="p-5 sm:p-10 rounded-3xl bg-gradient-to-br from-[#0c0c0e] via-[#111116] to-[#0c0c0e] border-2 border-[#EAE905]/30 relative overflow-hidden shadow-2xl">
        <div class="absolute -right-20 -top-20 w-80 h-80 bg-[#EAE905]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 min-w-0 max-w-full">
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
                  EA SPORTS FC 27
                </span>
              </div>

              <h2 class="text-3xl sm:text-4xl font-semibold text-white tracking-tight break-words">
                {{ clubName() }}
              </h2>

              <p class="text-xs text-slate-400 flex items-center gap-2">
                <span>EA Club ID: <code class="text-slate-300 font-mono bg-black/50 px-1.5 py-0.5 rounded border border-white/10">{{ clubId() }}</code></span>

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
            <div class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Match record</div>
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

          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          (click)="activeTab.set('matches')"
          class="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
          [ngClass]="activeTab() === 'matches' ? 'bg-[#EAE905] !text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
        >
          <span [class.!text-black]="activeTab() === 'matches'">Recent matches</span>
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
          <span [class.!text-black]="activeTab() === 'summary'">Club statistics</span>
        </button>
      </div>

      <!-- Tab 1: Recent Matches Feed -->
      @if(activeTab() === 'matches') {
        @if(isLoadingConfig() || isLoadingMatches()) {
          <div class="py-20 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
            <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-sm font-bold text-slate-300">Loading...</p>
          </div>
        } @else if (configError() || matchesError()) {
          <!-- The error and retry action are presented above, not as empty data. -->
        } @else if (matches().length === 0) {
          <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-3">
            <div class="text-4xl">⚽</div>
            <h3 class="text-base font-semibold text-white">No Matches Synchronized</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto">
              No recent matches recorded on EA servers for this club yet. Completed games will appear here automatically.
            </p>
          </div>
        } @else {
          <div class="space-y-5">
            @for (match of matches(); track match.matchId) {
              <app-ea-match-card
                [match]="match"
                theme="public"
                [expanded]="expandedMatchId() === match.matchId"
                (toggle)="toggleExpandMatch($event)"
              />
            }
          </div>
        }
      }

      <!-- Tab 2: Squad Leaderboard & Member Statistics -->
      @if(activeTab() === 'roster') {
        @if(isLoadingConfig() || isLoadingMembers()) {
          <div class="py-20 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
            <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-sm font-bold text-slate-300">Loading...</p>
          </div>
        } @else if (configError() || membersError()) {
          <!-- A failed member request must not be described as no member records. -->
        } @else if (members().length === 0) {
          <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-3">
            <div class="text-4xl">👥</div>
            <h3 class="text-base font-semibold text-white">No Member Records</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto">Could not fetch individual member statistics for {{ clubName() }}.</p>
          </div>
        } @else {
          <app-ea-member-table [members]="members()" theme="public" heading="Player statistics" />
        }
      }

      <!-- Tab 3: Club statistics -->
      @if(activeTab() === 'summary') {
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Win rate</div>
            <div class="text-4xl font-black text-white">{{ winRate() }}%</div>
            <p class="text-xs text-slate-400 leading-relaxed">
              {{ totalMatches() }} matches played.
            </p>
            <div class="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-[#EAE905]" [style.width.%]="winRate()"></div>
            </div>
          </div>

          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-emerald-400 uppercase tracking-wider">Goals scored</div>
            <div class="text-4xl font-black text-emerald-400">{{ goals() }}</div>
            <p class="text-xs text-slate-400 leading-relaxed">
              Total goals scored with an average of {{ totalMatches() > 0 ? (goals() / totalMatches()).toFixed(2) : 0 }} goals per game.
            </p>
          </div>

          <div class="p-6 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-4">
            <div class="text-xs font-mono text-cyan-400 uppercase tracking-wider">Clean sheets</div>
            <div class="text-4xl font-black text-cyan-400">{{ cleanSheets() }}</div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PublicClubComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private requestVersion = 0;
  private disposed = false;
  private targetGuildId = 'default';
  readonly configError = signal<string | null>(null);
  readonly matchesError = signal<string | null>(null);
  readonly membersError = signal<string | null>(null);
  readonly errorMessage = computed(() => this.configError() || this.matchesError() || this.membersError());

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
  readonly clubId = computed(() => this.config()?.clubId || '—');
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
    const identifier = clubData.teamId || clubData.customKit?.crestAssetId;
    if (!identifier) return null;
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
    return data?.skillRating ?? '—';
  });

  readonly bestDivision = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return data?.bestDivision != null ? `Div ${data.bestDivision}` : '—';
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
    this.destroy.onDestroy(() => { this.disposed = true; this.requestVersion++; });
    // Bot buttons include a guildId. Honour it without borrowing another club
    // from a staff member's cached admin selection; ordinary visits use default.
    this.route.queryParamMap.pipe(
      map(params => {
        const id = params.get('guildId');
        return id && /^\d{17,20}$/.test(id) ? id : 'default';
      }),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroy),
    ).subscribe(guildId => { void this.loadAllData(guildId); });
  }

  private isCurrent(request: number): boolean {
    return !this.disposed && request === this.requestVersion;
  }

  async loadAllData(guildId: string): Promise<void> {
    const request = ++this.requestVersion;
    if (this.targetGuildId !== guildId) {
      // A new deep link must never briefly show the previous club's data.
      this.config.set(null); this.clubInfo.set(null); this.overallStats.set(null);
      this.matches.set([]); this.members.set([]); this.expandedMatchId.set(null);
    }
    this.targetGuildId = guildId;
    this.configError.set(null); this.matchesError.set(null); this.membersError.set(null);
    this.isLoadingConfig.set(true);
    this.isLoadingMatches.set(false); this.isLoadingMembers.set(false);
    try {
      const data = await this.api.getEaConfig(guildId);
      if (!this.isCurrent(request)) return;
      if (!data?.config?.clubId) throw new Error('Missing club configuration');
      this.config.set(data.config); this.clubInfo.set(data.clubInfo); this.overallStats.set(data.overallStats);
      await Promise.all([this.loadMatches(guildId, request), this.loadMembers(guildId, request)]);
    } catch {
      if (this.isCurrent(request)) this.configError.set('Club details could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingConfig.set(false);
    }
  }

  private async loadMatches(guildId: string, request: number): Promise<void> {
    this.isLoadingMatches.set(true);
    try {
      const list = await this.api.getEaMatches(guildId, 15);
      if (!this.isCurrent(request)) return;
      if (!Array.isArray(list)) throw new Error('Invalid match response');
      this.matches.set(list);
    } catch {
      if (this.isCurrent(request)) this.matchesError.set('Recent matches could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingMatches.set(false);
    }
  }

  private async loadMembers(guildId: string, request: number): Promise<void> {
    this.isLoadingMembers.set(true);
    try {
      const data = await this.api.getEaMembers(guildId);
      if (!this.isCurrent(request)) return;
      const list = data?.members ?? data;
      if (!Array.isArray(list)) throw new Error('Invalid member response');
      this.members.set(list);
    } catch {
      if (this.isCurrent(request)) this.membersError.set('Club member statistics could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingMembers.set(false);
    }
  }

  refreshData(): void {
    // Avoid overlapping manual refreshes. Version checks above also protect
    // against late replies when Angular reuses the route for a new guildId.
    if (!this.isLoadingConfig() && !this.disposed) void this.loadAllData(this.targetGuildId);
  }

  toggleExpandMatch(matchId: string): void {
    if (this.expandedMatchId() === matchId) {
      this.expandedMatchId.set(null);
    } else {
      this.expandedMatchId.set(matchId);
    }
  }

  readonly formatTimestamp = formatEaTimestamp;
}
