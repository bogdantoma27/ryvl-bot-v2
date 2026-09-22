import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { VpgStandingsRow, VpgLeaderboardEntry } from '../../core/models';

@Component({
  selector: 'app-public-standings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#EAE905]/15 pb-6">
        <div>
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Official Standings</div>
          <h1 class="text-4xl font-black text-white uppercase tracking-tight">League Standings & Statistics</h1>
          <p class="text-xs sm:text-sm text-slate-400 mt-2">
            Official table standings and player leaderboards for Virtual Pro Gaming competitions.
          </p>
        </div>

        <!-- Season Selector -->
        <div class="flex items-center gap-3">
          <label class="text-xs font-mono text-slate-400 uppercase">Season:</label>
          <select
            [ngModel]="selectedSeason()"
            (ngModelChange)="onSeasonChange($event)"
            class="bg-[#121214] border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#EAE905] cursor-pointer"
          >
            @for (s of seasons(); track s) {
              <option [value]="s">Season {{ s }}</option>
            }
          </select>
        </div>
      </div>

      <!-- Section 1: League Table -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <span class="text-[#EAE905]">🏆</span>
            <span>League Table</span>
          </h2>
          <span class="text-xs text-slate-400">Season {{ selectedSeason() }}</span>
        </div>

        @if (isLoadingStandings()) {
          <div class="h-96 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
        } @else if (standings().length === 0) {
          <div class="p-12 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center text-slate-400 text-sm">
            No standings data available for this season.
          </div>
        } @else {
          <div class="rounded-2xl bg-[#0c0c0e] border border-white/10 overflow-hidden shadow-xl">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-[#121214] border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                    <th class="py-3.5 px-4 w-12 text-center">Pos</th>
                    <th class="py-3.5 px-4">Club</th>
                    <th class="py-3.5 px-3 text-center">MP</th>
                    <th class="py-3.5 px-3 text-center">W</th>
                    <th class="py-3.5 px-3 text-center">D</th>
                    <th class="py-3.5 px-3 text-center">L</th>
                    <th class="py-3.5 px-3 text-center">GF</th>
                    <th class="py-3.5 px-3 text-center">GA</th>
                    <th class="py-3.5 px-3 text-center">GD</th>
                    <th class="py-3.5 px-4 text-center font-bold text-white">PTS</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  @for (r of standings(); track r.position) {
                    @let isRyvl = isRyvlTeam(r.teamName);
                    <tr
                      class="transition hover:bg-white/5"
                      [class.bg-[#EAE905]/10]="isRyvl"
                      [class.font-bold]="isRyvl"
                    >
                      <td class="py-3 px-4 text-center">
                        <span
                          class="inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-xs font-bold"
                          [class.bg-[#EAE905]]="isRyvl"
                          [class.text-black]="isRyvl"
                          [class.text-slate-400]="!isRyvl && r.position > 3"
                          [class.text-[#EAE905]]="!isRyvl && r.position <= 3"
                        >
                          {{ r.position }}
                        </span>
                      </td>

                      <td class="py-3 px-4">
                        <div class="flex items-center gap-3">
                          @if (r.teamLogoUrl) {
                            <img [src]="r.teamLogoUrl" alt="" class="w-6 h-6 object-contain shrink-0" />
                          } @else {
                            <div class="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-[10px] text-slate-400 shrink-0">FC</div>
                          }
                          <span class="text-white truncate" [class.text-[#EAE905]]="isRyvl">
                            {{ r.teamName }}
                          </span>
                          @if (isRyvl) {
                            <span class="px-1.5 py-0.5 rounded bg-[#EAE905] text-black text-[9px] font-black uppercase tracking-wider">
                              RYVL
                            </span>
                          }
                        </div>
                      </td>

                      <td class="py-3 px-3 text-center text-slate-300 font-mono">{{ r.played }}</td>
                      <td class="py-3 px-3 text-center text-slate-300 font-mono">{{ r.wins }}</td>
                      <td class="py-3 px-3 text-center text-slate-300 font-mono">{{ r.draws }}</td>
                      <td class="py-3 px-3 text-center text-slate-300 font-mono">{{ r.losses }}</td>
                      <td class="py-3 px-3 text-center text-slate-400 font-mono">{{ r.scoreFor }}</td>
                      <td class="py-3 px-3 text-center text-slate-400 font-mono">{{ r.scoreAgainst }}</td>
                      <td class="py-3 px-3 text-center font-mono" [class.text-emerald-400]="r.goalDifference > 0" [class.text-rose-400]="r.goalDifference < 0">
                        {{ r.goalDifference > 0 ? '+' + r.goalDifference : r.goalDifference }}
                      </td>
                      <td class="py-3 px-4 text-center font-mono font-black text-sm text-[#EAE905]">
                        {{ r.points }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>

      <!-- Section 2: Player Leaderboards -->
      <div class="space-y-6 pt-6 border-t border-white/10">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <span class="text-[#EAE905]">⭐</span>
              <span>Individual Leaderboards</span>
            </h2>
            <p class="text-xs text-slate-400 mt-1">Top players across official VPG competitions in scoring, playmaking, and defense.</p>
          </div>

          <!-- Category Buttons -->
          <div class="flex flex-wrap items-center gap-1.5 bg-[#121214] p-1.5 rounded-xl border border-white/10">
            @for (cat of categories; track cat.key) {
              <button
                type="button"
                (click)="onCategoryChange(cat.key)"
                class="px-3 py-1.5 rounded-lg text-xs uppercase transition cursor-pointer"
                [ngClass]="selectedCategory() === cat.key ? 'bg-[#EAE905] text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'text-slate-300 hover:text-white font-bold'"
              >
                {{ cat.label }}
              </button>
            }
          </div>
        </div>

        @if (isLoadingLeaderboard()) {
          <div class="h-64 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
        } @else if (leaderboard().length === 0) {
          <div class="p-12 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center text-slate-400 text-sm">
            No leaderboard statistics available for this category yet.
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (e of leaderboard(); track e.rank) {
              <div class="p-4 rounded-xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-lg font-black font-mono" [class.text-[#EAE905]]="e.rank <= 3" [class.text-slate-500]="e.rank > 3">
                    #{{ e.rank }}
                  </span>
                  @if (e.userAvatarUrl) {
                    <img [src]="e.userAvatarUrl" alt="" class="w-9 h-9 rounded-full object-cover shrink-0" />
                  } @else {
                    <div class="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                      {{ e.username.charAt(0) }}
                    </div>
                  }
                  <div class="min-w-0">
                    <div class="text-xs font-bold text-white truncate" [class.text-[#EAE905]]="isRyvlTeam(e.teamName)">
                      {{ e.username }}
                    </div>
                    <div class="text-[11px] text-slate-400 truncate">{{ e.teamName }}</div>
                  </div>
                </div>

                <div class="text-right shrink-0">
                  @if (selectedCategory() === 'strikers') {
                    <div class="text-base font-black font-mono text-[#EAE905]">{{ e.goals }} <span class="text-[10px] text-slate-400 font-normal">G</span></div>
                    <div class="text-[10px] text-slate-500 font-mono">{{ e.matchesPlayed }} Matches</div>
                  } @else if (selectedCategory() === 'cam' || selectedCategory() === 'wingers') {
                    <div class="text-base font-black font-mono text-[#EAE905]">{{ e.assists }} <span class="text-[10px] text-slate-400 font-normal">A</span></div>
                    <div class="text-[10px] text-slate-500 font-mono">{{ e.goals }}G • {{ e.matchesPlayed }}M</div>
                  } @else if (selectedCategory() === 'gk' || selectedCategory() === 'cb') {
                    <div class="text-base font-black font-mono text-emerald-400">{{ e.cleanSheets ?? 0 }} <span class="text-[10px] text-slate-400 font-normal">CS</span></div>
                    <div class="text-[10px] text-slate-500 font-mono">Rating: {{ e.rating ?? '-' }}</div>
                  } @else {
                    <div class="text-base font-black font-mono text-[#EAE905]">{{ e.goals + e.assists }} <span class="text-[10px] text-slate-400 font-normal">G+A</span></div>
                    <div class="text-[10px] text-slate-500 font-mono">{{ e.matchesPlayed }}M</div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class StandingsComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly seasons = signal<number[]>([2, 1]);
  readonly selectedSeason = signal<number>(2);
  readonly standings = signal<VpgStandingsRow[]>([]);
  readonly leaderboard = signal<VpgLeaderboardEntry[]>([]);
  readonly selectedCategory = signal<string>('strikers');

  readonly isLoadingStandings = signal<boolean>(true);
  readonly isLoadingLeaderboard = signal<boolean>(true);

  readonly categories = [
    { key: 'strikers', label: 'Top Scorers (ST)' },
    { key: 'cam', label: 'Playmakers (CAM)' },
    { key: 'wingers', label: 'Wingers (LW/RW)' },
    { key: 'cdm', label: 'Def. Midfield (CDM)' },
    { key: 'cb', label: 'Defenders (CB)' },
    { key: 'gk', label: 'Goalkeepers (GK)' },
  ];

  async ngOnInit(): Promise<void> {
    await this.initSeasons();
    await Promise.all([this.loadStandings(), this.loadLeaderboard()]);
  }

  async initSeasons(): Promise<void> {
    try {
      const data = await this.api.getSuperligaSeasons();
      if (data?.seasons?.length) {
        this.seasons.set(data.seasons);
        this.selectedSeason.set(data.latest || data.seasons[0]);
      }
    } catch {
      // fallback
    }
  }

  async loadStandings(): Promise<void> {
    this.isLoadingStandings.set(true);
    try {
      const res = await this.api.getSuperligaStandings(this.selectedSeason());
      this.standings.set(res?.standings || []);
    } catch (err) {
      console.error('Failed to load Superliga standings:', err);
    } finally {
      this.isLoadingStandings.set(false);
    }
  }

  async loadLeaderboard(): Promise<void> {
    this.isLoadingLeaderboard.set(true);
    try {
      const res = await this.api.getSuperligaLeaderboard(this.selectedCategory() as any, this.selectedSeason());
      this.leaderboard.set(res?.leaderboard || []);
    } catch (err) {
      console.error('Failed to load Superliga leaderboard:', err);
    } finally {
      this.isLoadingLeaderboard.set(false);
    }
  }

  onSeasonChange(newSeason: number): void {
    this.selectedSeason.set(Number(newSeason));
    this.loadStandings();
    this.loadLeaderboard();
  }

  onCategoryChange(cat: string): void {
    this.selectedCategory.set(cat);
    this.loadLeaderboard();
  }

  isRyvlTeam(name: string): boolean {
    return /ryvl|rival/i.test(name);
  }
}
