import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { SuperligaMvpEntry, SuperligaMvpLeaderboard, SuperligaMvpMatches } from '../../core/models';

@Component({
  selector: 'app-admin-superliga-mvp',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 pb-12">
      @if (toast()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium"
          [ngClass]="toast()!.type === 'error' ? 'bg-rose-900 border border-rose-600 text-rose-100' : 'bg-emerald-900 border border-emerald-600 text-emerald-100'"
        >
          <span>{{ toast()!.text }}</span>
          <button (click)="toast.set(null)" class="text-xs opacity-75 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      }

      <!-- Header -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#1a274a] to-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-2xl">🏅</span>
              <h1 class="text-2xl font-black text-white tracking-tight">Superliga MVP</h1>
              @if (board()) {
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Season {{ board()!.season }}
                </span>
              }
            </div>
            <p class="text-sm text-slate-400 mt-1">
              Full EA match stats for every VPG Superliga România game, ranked by MVP score.
            </p>
          </div>
          <button
            (click)="sync()"
            [disabled]="isSyncing()"
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            @if (isSyncing()) {
              <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            } @else {
              <span>🔄</span>
            }
            <span>Sync now</span>
          </button>
        </div>

        @if (board(); as b) {
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div class="bg-[#11192e] border border-slate-800 rounded-xl p-3">
              <div class="text-[11px] uppercase font-bold text-slate-400">Matches tracked</div>
              <div class="text-xl font-black text-white">{{ b.matches.linked }}</div>
            </div>
            <div class="bg-[#11192e] border border-slate-800 rounded-xl p-3">
              <div class="text-[11px] uppercase font-bold text-slate-400">Waiting for EA</div>
              <div class="text-xl font-black text-white">{{ b.matches.pending }}</div>
            </div>
            <div class="bg-[#11192e] border border-slate-800 rounded-xl p-3">
              <div class="text-[11px] uppercase font-bold text-slate-400">Ranked players</div>
              <div class="text-xl font-black text-white">{{ b.eligiblePlayers }} <span class="text-xs text-slate-400 font-semibold">of {{ b.totalPlayers }}</span></div>
            </div>
            <div class="bg-[#11192e] border border-slate-800 rounded-xl p-3">
              <div class="text-[11px] uppercase font-bold text-slate-400">Teams linked to EA</div>
              <div class="text-xl font-black text-white">{{ linkedTeams() }} <span class="text-xs text-slate-400 font-semibold">of {{ matchData()?.teams?.length || 0 }}</span></div>
            </div>
          </div>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Controls -->
        <div class="lg:col-span-4 space-y-6">
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <h2 class="text-sm font-bold text-white">📢 Post publicly</h2>
            <div>
              <label for="mvp-channel" class="block text-xs font-semibold text-slate-300 mb-1.5">Channel</label>
              <select
                id="mvp-channel"
                [ngModel]="channelId()"
                (ngModelChange)="channelId.set($event)"
                class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option [ngValue]="null">Select a channel</option>
                @for (c of channels(); track c.id) {
                  <option [ngValue]="c.id"># {{ c.name }}</option>
                }
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="mvp-count" class="block text-xs font-semibold text-slate-300 mb-1.5">Players shown</label>
                <input id="mvp-count" type="number" min="1" max="25" [ngModel]="count()" (ngModelChange)="count.set(+$event || 15)"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400" />
              </div>
              <div>
                <label for="mvp-min" class="block text-xs font-semibold text-slate-300 mb-1.5">Min. matches</label>
                <input id="mvp-min" type="number" min="1" [placeholder]="board()?.minMatches ?? 'auto'" [ngModel]="minMatches()"
                  (ngModelChange)="minMatches.set(+$event || null)" (change)="load()"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400" />
              </div>
            </div>
            <button
              (click)="post()"
              [disabled]="isPosting() || !channelId()"
              class="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-extrabold text-xs transition disabled:opacity-50"
            >
              {{ isPosting() ? 'Posting...' : 'Post leaderboard to Discord' }}
            </button>
            <p class="text-[11px] text-slate-400">
              The leaderboard stays private to admins until you post it. In Discord, admins can also use
              <code class="text-amber-300">/superliga_mvp leaderboard</code> and <code class="text-amber-300">/superliga_mvp post</code>.
            </p>
          </div>

          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-2">
            <h2 class="text-sm font-bold text-white">🧮 How the score works</h2>
            <p class="text-xs text-slate-300 leading-relaxed">{{ board()?.formula }}</p>
            @if (board(); as b) {
              <p class="text-xs text-slate-400">Minimum to qualify right now: <span class="text-white font-bold">{{ b.minMatches }}</span> tracked matches.</p>
            }
          </div>

          @if (unlinkedTeams().length) {
            <div class="bg-[#16213e] border border-amber-700/40 rounded-2xl p-5 shadow-lg space-y-2">
              <h2 class="text-sm font-bold text-amber-300">⚠️ Teams without an EA club on VPG</h2>
              <p class="text-xs text-slate-400">Their games are only tracked when the opponent has linked its club.</p>
              <ul class="text-xs text-slate-200 space-y-1">
                @for (t of unlinkedTeams(); track t.slug) {
                  <li>{{ t.name }}</li>
                }
              </ul>
            </div>
          }
        </div>

        <!-- Leaderboard -->
        <div class="lg:col-span-8 bg-[#16213e] border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 class="text-sm font-bold text-white">Leaderboard</h2>
            <span class="text-[11px] text-slate-400">Select a player to see every stat</span>
          </div>
          @if (isLoading()) {
            <div class="p-10 text-center text-slate-400 text-sm">Loading...</div>
          } @else if (!board()?.entries?.length) {
            <div class="p-10 text-center text-slate-400 text-sm">
              {{ board()?.matches?.linked ? 'No player has enough tracked matches to qualify yet.' : 'No Superliga matches tracked yet. Stats appear after matches are played and found on EA.' }}
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-[#11192e] text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th class="px-3 py-2 text-left">#</th>
                    <th class="px-3 py-2 text-left">Player</th>
                    <th class="px-3 py-2 text-right">Score</th>
                    <th class="px-3 py-2 text-right">MP</th>
                    <th class="px-3 py-2 text-right">Avg</th>
                    <th class="px-3 py-2 text-right">G</th>
                    <th class="px-3 py-2 text-right">A</th>
                    <th class="px-3 py-2 text-right">Saves</th>
                    <th class="px-3 py-2 text-right">MOTM</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of board()!.entries; track e.playerName) {
                    <tr
                      (click)="toggle(e)"
                      class="border-t border-slate-800 hover:bg-[#1f2e54] cursor-pointer"
                      [ngClass]="{ 'bg-[#1a274a]': expanded() === e.playerName }"
                    >
                      <td class="px-3 py-2 font-bold text-slate-300">{{ medal(e.rank) }}</td>
                      <td class="px-3 py-2">
                        <div class="font-bold text-white">{{ e.playerName }}
                          @if (e.role === 'GK') { <span class="ml-1 text-[10px] px-1.5 rounded bg-sky-500/20 text-sky-300">GK</span> }
                        </div>
                        <div class="text-[11px] text-slate-400">{{ e.teamName }}</div>
                      </td>
                      <td class="px-3 py-2 text-right font-black text-amber-400">{{ e.score | number: '1.1-1' }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.matches }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.totals.ratingSum / e.matches | number: '1.1-1' }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.totals.goals }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.totals.assists }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.totals.saves }}</td>
                      <td class="px-3 py-2 text-right text-slate-200">{{ e.totals.mom }}</td>
                    </tr>
                    @if (expanded() === e.playerName) {
                      <tr class="bg-[#11192e]">
                        <td colspan="9" class="px-4 py-3">
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            @for (m of e.metrics; track m.key) {
                              <div>
                                <div class="flex justify-between text-[11px]">
                                  <span class="text-slate-300">{{ m.label }} <span class="text-slate-500">({{ m.value }})</span></span>
                                  <span class="font-bold text-white">{{ m.percentile | number: '1.0-0' }}</span>
                                </div>
                                <div class="h-1.5 rounded bg-slate-800 overflow-hidden">
                                  <div class="h-full bg-amber-400" [style.width.%]="m.percentile"></div>
                                </div>
                              </div>
                            }
                          </div>
                          <div class="mt-3 text-[11px] text-slate-400">
                            Totals: {{ e.totals.shots }} shots · {{ e.totals.passesMade }}/{{ e.totals.passAttempts }} passes ·
                            {{ e.totals.tacklesMade }}/{{ e.totals.tackleAttempts }} tackles · {{ e.totals.cleanSheets }} clean sheets ·
                            {{ e.totals.goalsConceded }} conceded · {{ e.totals.redCards }} red cards
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>

      <!-- Match tracking -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-800">
          <h2 class="text-sm font-bold text-white">Match tracking</h2>
          <p class="text-[11px] text-slate-400">Each Superliga result and the EA match its stats came from.</p>
        </div>
        <div class="overflow-x-auto max-h-[28rem]">
          <table class="w-full text-xs">
            <thead class="bg-[#11192e] text-slate-400 uppercase text-[10px] sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">Round</th>
                <th class="px-3 py-2 text-left">Match</th>
                <th class="px-3 py-2 text-left">Kickoff</th>
                <th class="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (m of matchData()?.matches || []; track m.vpgMatchId) {
                <tr class="border-t border-slate-800">
                  <td class="px-3 py-2 text-slate-400">{{ m.matchDay ?? '-' }}</td>
                  <td class="px-3 py-2 text-white">{{ m.homeTeamName }} <b>{{ m.homeScore }}-{{ m.awayScore }}</b> {{ m.awayTeamName }}</td>
                  <td class="px-3 py-2 text-slate-300">{{ m.kickoffAt | date: 'd MMM, HH:mm' }}</td>
                  <td class="px-3 py-2">
                    @switch (m.status) {
                      @case ('LINKED') { <span class="text-emerald-400 font-bold">Tracked · {{ m.playerCount }} players</span> }
                      @case ('PENDING') { <span class="text-amber-300 font-bold">Waiting</span> }
                      @default { <span class="text-slate-500 font-bold">Not tracked</span> }
                    }
                    @if (m.lastError) { <div class="text-[10px] text-slate-500">{{ m.lastError }}</div> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="px-3 py-6 text-center text-slate-400">No Superliga results recorded yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class AdminSuperligaMvpComponent {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);

  readonly board = signal<SuperligaMvpLeaderboard | null>(null);
  readonly matchData = signal<SuperligaMvpMatches | null>(null);
  readonly isLoading = signal(false);
  readonly isSyncing = signal(false);
  readonly isPosting = signal(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);
  readonly expanded = signal<string | null>(null);
  readonly channelId = signal<string | null>(null);
  readonly count = signal(15);
  readonly minMatches = signal<number | null>(null);

  readonly channels = computed(() => this.guildStore.activeGuild()?.channels || []);
  readonly linkedTeams = computed(() => (this.matchData()?.teams || []).filter((t) => t.eaClubId).length);
  readonly unlinkedTeams = computed(() => (this.matchData()?.teams || []).filter((t) => !t.eaClubId));

  private loadedGuild: string | null = null;

  constructor() {
    effect(() => {
      const guildId = this.guildStore.activeGuildId();
      if (guildId && guildId !== this.loadedGuild) {
        this.loadedGuild = guildId;
        void this.load();
      }
    });
  }

  medal(rank: number): string {
    return ['🥇', '🥈', '🥉'][rank - 1] ?? String(rank);
  }

  toggle(e: SuperligaMvpEntry): void {
    this.expanded.set(this.expanded() === e.playerName ? null : e.playerName);
  }

  async load(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isLoading.set(true);
    try {
      const [board, matches] = await Promise.all([
        this.api.getSuperligaMvpLeaderboard(guildId, { minMatches: this.minMatches() }),
        this.api.getSuperligaMvpMatches(guildId),
      ]);
      this.board.set(board);
      this.matchData.set(matches);
    } catch (err) {
      this.showError(err, 'Could not load the Superliga MVP leaderboard');
    } finally {
      this.isLoading.set(false);
    }
  }

  async sync(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isSyncing.set(true);
    try {
      const r = await this.api.syncSuperligaMvp(guildId);
      this.toast.set({ type: 'success', text: `Sync done: ${r.newMatches} new result(s), ${r.linked} linked to EA, ${r.stillPending} waiting.` });
      await this.load();
    } catch (err) {
      this.showError(err, 'Sync failed');
    } finally {
      this.isSyncing.set(false);
    }
  }

  async post(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const channelId = this.channelId();
    if (!guildId || !channelId) return;
    this.isPosting.set(true);
    try {
      await this.api.postSuperligaMvp(guildId, { channelId, minMatches: this.minMatches(), count: this.count() });
      this.toast.set({ type: 'success', text: 'Leaderboard posted to Discord.' });
    } catch (err) {
      this.showError(err, 'Could not post the leaderboard');
    } finally {
      this.isPosting.set(false);
    }
  }

  private showError(err: unknown, fallback: string): void {
    const message = (err as { error?: { message?: string } })?.error?.message;
    this.toast.set({ type: 'error', text: message || fallback });
  }
}
