import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { RegisteredDiscordPlayer, PlayerRegistrationAudit } from '../../core/models';

@Component({
  selector: 'app-ea-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
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
                      @for (tc of trackedClubs(); track tc.clubId) {
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
              90s
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
              <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:border-slate-700 transition">
                <!-- Match Header Bar -->
                <div class="px-5 py-3.5 bg-[#11192e] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div class="flex items-center gap-2.5">
                    <!-- Outcome Badge -->
                    <span
                      class="px-2.5 py-0.5 rounded-full font-black text-[11px] tracking-wide"
                      [ngClass]="{
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30': match.outcome === 'WIN',
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30': match.outcome === 'LOSS',
                        'bg-amber-500/20 text-amber-400 border border-amber-500/30': match.outcome === 'DRAW'
                      }"
                    >
                      {{ match.outcome === 'WIN' ? '🏆 VICTORY' : match.outcome === 'LOSS' ? '💔 DEFEAT' : '🤝 DRAW' }}
                    </span>

                    <span class="text-slate-400 font-semibold">{{ match.matchTypeLabel || 'Pro Clubs Match' }}</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-slate-400">{{ formatTimestamp(match.timestamp) }}</span>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="toggleExpandMatch(match.matchId)"
                      class="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-950/40 transition cursor-pointer"
                    >
                      {{ expandedMatchId() === match.matchId ? 'Hide Details ▲' : 'View Stats ▼' }}
                    </button>
                  </div>
                </div>

                <!-- Match Scoreboard Display -->
                <div class="p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                  <!-- Tracked Team (Left) -->
                  <div class="flex items-center gap-4 flex-1 justify-end order-1 md:order-1">
                    <div class="text-right">
                      <div class="text-sm font-black text-white">{{ match.trackedClub.name }}</div>
                      <div class="text-[11px] text-slate-400">{{ match.trackedPlayers.length }} Players Rated</div>
                    </div>
                    <img
                      [src]="match.trackedClub.crestUrl || defaultCrest"
                      alt="Tracked Crest"
                      class="w-12 h-12 object-contain rounded-xl bg-slate-900/50 p-1 border border-slate-700"
                    />
                  </div>

                  <!-- Central Score Box -->
                  <div class="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-[#0f172a] border border-slate-700 shadow-inner order-2">
                    <span class="text-2xl font-black" [ngClass]="match.trackedClub.score > match.opponentClub.score ? 'text-emerald-400' : 'text-white'">
                      {{ match.trackedClub.score }}
                    </span>
                    <span class="text-slate-600 font-bold">:</span>
                    <span class="text-2xl font-black" [ngClass]="match.opponentClub.score > match.trackedClub.score ? 'text-emerald-400' : 'text-white'">
                      {{ match.opponentClub.score }}
                    </span>
                  </div>

                  <!-- Opponent Team (Right) -->
                  <div class="flex items-center gap-4 flex-1 order-3">
                    <img
                      [src]="match.opponentClub.crestUrl || defaultCrest"
                      alt="Opponent Crest"
                      class="w-12 h-12 object-contain rounded-xl bg-slate-900/50 p-1 border border-slate-700"
                    />
                    <div>
                      <div class="text-sm font-black text-white">{{ match.opponentClub.name }}</div>
                      <div class="text-[11px] text-slate-400">Club ID: {{ match.opponentClub.id }}</div>
                    </div>
                  </div>
                </div>

                <!-- Expanded Match Details -->
                @if (expandedMatchId() === match.matchId) {
                  <div class="px-5 pb-5 pt-2 border-t border-slate-800/80 bg-[#11192e]/60 space-y-5 animate-fadeIn">
                    <!-- Aggregate Comparison Stats -->
                    @if (match.trackedClub.aggregate || match.opponentClub.aggregate) {
                      <div>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Team Aggregate Statistics</h4>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                            <div class="text-slate-400 text-[10px]">Shots on Target</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.shots ?? 0 }} vs {{ match.opponentClub.aggregate?.shots ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                            <div class="text-slate-400 text-[10px]">Passes Completed</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.passesmade ?? 0 }} / {{ match.trackedClub.aggregate?.passattempts ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                            <div class="text-slate-400 text-[10px]">Tackles Made</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.tacklesmade ?? 0 }} vs {{ match.opponentClub.aggregate?.tacklesmade ?? 0 }}
                            </div>
                          </div>

                          <div class="bg-[#16213e] p-2.5 rounded-xl border border-slate-800">
                            <div class="text-slate-400 text-[10px]">Goalkeeper Saves</div>
                            <div class="text-sm font-bold text-white mt-1">
                              {{ match.trackedClub.aggregate?.saves ?? 0 }} vs {{ match.opponentClub.aggregate?.saves ?? 0 }}
                            </div>
                          </div>
                        </div>
                      </div>
                    }

                    <!-- Player Ratings Table -->
                    @if (match.trackedPlayers.length > 0) {
                      <div>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                          {{ match.trackedClub.name }} Squad Scorecard
                        </h4>
                        <div class="overflow-x-auto">
                          <table class="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                            <thead class="bg-[#16213e] text-slate-400 text-[11px] uppercase font-bold">
                              <tr>
                                <th class="py-2 px-3">Player</th>
                                <th class="py-2 px-3">Pos</th>
                                <th class="py-2 px-3 text-center">Rating</th>
                                <th class="py-2 px-3 text-center">Goals</th>
                                <th class="py-2 px-3 text-center">Assists</th>
                                <th class="py-2 px-3 text-center">Passes</th>
                                <th class="py-2 px-3 text-center">Tackles</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/80 bg-[#11192e]">
                              @for (p of match.trackedPlayers; track p.gamertag) {
                                <tr class="hover:bg-slate-800/40 transition">
                                  <td class="py-2 px-3 font-semibold text-white flex items-center gap-1.5">
                                    @if (p.isMom) {
                                      <span title="Man of the Match">⭐</span>
                                    }
                                    <span>{{ p.gamertag }}</span>
                                  </td>
                                  <td class="py-2 px-3 text-slate-400 uppercase font-mono text-[10px]">{{ p.position }}</td>
                                  <td class="py-2 px-3 text-center font-extrabold" [ngClass]="p.rating >= 8.0 ? 'text-emerald-400' : p.rating >= 7.0 ? 'text-sky-400' : 'text-slate-300'">
                                    {{ p.rating.toFixed(1) }}
                                  </td>
                                  <td class="py-2 px-3 text-center font-bold text-white">{{ p.goals || '-' }}</td>
                                  <td class="py-2 px-3 text-center font-bold text-white">{{ p.assists || '-' }}</td>
                                  <td class="py-2 px-3 text-center text-slate-400">{{ p.passesMade }}/{{ p.passAttempts }}</td>
                                  <td class="py-2 px-3 text-center text-slate-400">{{ p.tacklesMade }}/{{ p.tackleAttempts }}</td>
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
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-white">Club Roster & Leaderboard</h3>
                <p class="text-xs text-slate-400">All-time member performance statistics for {{ clubName() }}</p>
              </div>
              <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
                {{ members().length }} Registered Players
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-[#16213e] text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                  <tr>
                    <th class="py-3 px-4">Player</th>
                    <th class="py-3 px-4 text-center">Games</th>
                    <th class="py-3 px-4 text-center">Goals</th>
                    <th class="py-3 px-4 text-center">Assists</th>
                    <th class="py-3 px-4 text-center">MOTM</th>
                    <th class="py-3 px-4 text-center">Avg Rating</th>
                    <th class="py-3 px-4 text-center">Pass %</th>
                    <th class="py-3 px-4 text-center">Tackle %</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/80">
                  @for (m of members(); track m.name) {
                    <tr class="hover:bg-slate-800/30 transition">
                      <td class="py-3 px-4 font-bold text-white flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-300 font-bold">
                          {{ m.name.slice(0, 2).toUpperCase() }}
                        </div>
                        <span>{{ m.name }}</span>
                      </td>
                      <td class="py-3 px-4 text-center font-semibold text-slate-200">{{ m.gamesPlayed || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-emerald-400">{{ m.goals || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-sky-400">{{ m.assists || 0 }}</td>
                      <td class="py-3 px-4 text-center font-bold text-amber-400">{{ m.manOfTheMatch || 0 }}</td>
                      <td class="py-3 px-4 text-center font-extrabold text-white">{{ m.rating ? (+m.rating).toFixed(1) : '-' }}</td>
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

      <!-- Tab: Registered Players -->
      @if (isAdmin() && activeTab() === 'players') {
        <div class="space-y-6">
          <!-- Link New Player Card -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div class="border-b border-slate-800 pb-3">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🔗</span>
                <span>Link Discord Member to EA Pro Clubs Gamertag</span>
              </h3>
              <p class="text-xs text-slate-400 mt-1">
                Associating Discord IDs with EA Gamertags enables commands like <code class="text-emerald-400">/stats me</code> and detailed individual tracking.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Discord Member -->
              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1">Discord Member</label>
                <select
                  [(ngModel)]="newRegUserId"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Select Member or Input ID --</option>
                  @for (m of guildMembers(); track m.id) {
                    <option [value]="m.id">{{ m.displayName || m.username }} ({{ m.id }})</option>
                  }
                </select>
                <div class="mt-1">
                  <input
                    type="text"
                    [(ngModel)]="newRegUserId"
                    placeholder="Or enter Discord User ID directly"
                    class="w-full bg-[#11192e] border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <!-- EA Gamertag -->
              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1">EA Gamertag / Player Name</label>
                <input
                  type="text"
                  [(ngModel)]="newRegEaName"
                  placeholder="Exact EA FC Gamertag"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <!-- Preferred Position -->
              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1">Preferred Position</label>
                <select
                  [(ngModel)]="newRegPos"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ST">ST / CF (Striker)</option>
                  <option value="CAM">CAM (Attacking Midfielder)</option>
                  <option value="CM">CM (Central Midfielder)</option>
                  <option value="CDM">CDM (Defensive Midfielder)</option>
                  <option value="RW">RW / RM (Right Winger)</option>
                  <option value="LW">LW / LM (Left Winger)</option>
                  <option value="CB">CB (Center Back)</option>
                  <option value="LB">LB / LWB (Left Back)</option>
                  <option value="RB">RB / RWB (Right Back)</option>
                  <option value="GK">GK (Goalkeeper)</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                (click)="linkPlayer()"
                [disabled]="isRegistering() || !newRegUserId || !newRegEaName"
                class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                @if (isRegistering()) {
                  <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  <span>Linking...</span>
                } @else {
                  <span>Link Player</span>
                }
              </button>
            </div>
          </div>

          <!-- Registered Players List -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-white">Linked Players Directory</h3>
                <p class="text-xs text-slate-400">All registered Discord members mapped to EA Pro Clubs profiles</p>
              </div>
              <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
                {{ registeredPlayers().length }} Linked
              </span>
            </div>

            @if (isLoadingPlayers()) {
              <div class="py-16 text-center text-slate-400 space-y-2">
                <div class="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p class="text-xs">Loading registered players...</p>
              </div>
            } @else if (registeredPlayers().length === 0) {
              <div class="p-12 text-center text-slate-400 space-y-2">
                <div class="text-3xl">👥</div>
                <h4 class="text-sm font-bold text-white">No Registered Players Yet</h4>
                <p class="text-xs">Use the form above or the Discord command <code class="text-emerald-400">/register-player</code> to link members.</p>
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-[#16213e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th class="py-3 px-4">Discord User</th>
                      <th class="py-3 px-4">EA Gamertag</th>
                      <th class="py-3 px-4 text-center">Position</th>
                      <th class="py-3 px-4">Linked Date</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/80">
                    @for (rp of registeredPlayers(); track rp.id) {
                      <tr class="hover:bg-slate-800/30 transition">
                        <td class="py-3 px-4 font-bold text-white">
                          <div>{{ getMemberDisplayName(rp.discordUserId) }}</div>
                          <div class="font-mono text-[10px] text-slate-400">{{ rp.discordUserId }}</div>
                        </td>
                        <td class="py-3 px-4 font-bold text-emerald-400 font-mono">{{ rp.eaPlayerName }}</td>
                        <td class="py-3 px-4 text-center font-extrabold text-amber-400">{{ rp.preferredPos || '-' }}</td>
                        <td class="py-3 px-4 text-slate-400">{{ formatTimestamp(rp.createdAt) }}</td>
                        <td class="py-3 px-4 text-right space-x-2">
                          <button
                            (click)="viewPlayerStats(rp.eaPlayerName)"
                            class="text-indigo-400 hover:text-indigo-300 font-bold text-xs"
                          >
                            View Stats
                          </button>
                          <button
                            (click)="unlinkPlayer(rp.discordUserId)"
                            class="text-rose-400 hover:text-rose-300 font-bold text-xs"
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <!-- Audit Trail Accordion / Box -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🛡️</span>
                <span>Registration Security Audit Log</span>
              </h3>
              <span class="text-xs text-slate-400">{{ auditLogs().length }} entries</span>
            </div>

            @if (auditLogs().length > 0) {
              <div class="overflow-x-auto max-h-60 overflow-y-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-[#11192e] text-slate-400 text-[10px] uppercase font-bold sticky top-0">
                    <tr>
                      <th class="py-2 px-3">Date</th>
                      <th class="py-2 px-3">Action</th>
                      <th class="py-2 px-3">User ID</th>
                      <th class="py-2 px-3">Gamertag</th>
                      <th class="py-2 px-3">Performed By</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/80">
                    @for (log of auditLogs(); track log.id) {
                      <tr class="hover:bg-slate-800/20 transition">
                        <td class="py-2 px-3 text-slate-400 text-[11px]">{{ formatTimestamp(log.createdAt) }}</td>
                        <td class="py-2 px-3 font-bold" [ngClass]="log.action === 'REGISTER' ? 'text-emerald-400' : 'text-rose-400'">
                          {{ log.action }}
                        </td>
                        <td class="py-2 px-3 font-mono text-slate-300">{{ log.discordUserId }}</td>
                        <td class="py-2 px-3 font-bold text-white">{{ log.eaPlayerName }}</td>
                        <td class="py-2 px-3 text-slate-400">{{ log.performedBy }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-xs text-slate-500">No audit log entries recorded yet.</p>
            }
          </div>
        </div>
      }


      <!-- Tab: Multi-Club EA Tracker -->
      @if (activeTab() === 'clubs') {
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
                  Track multiple clubs concurrently. Each club can announce into its own channel, or fall back to your
                  <a routerLink="/admin/settings" class="text-emerald-400 hover:underline font-medium">Default Live Results Channel</a> configured in Settings.
                </p>
              </div>
              <span class="text-xs bg-[#11192e] border border-slate-700 px-3 py-1.5 rounded-xl text-emerald-400 font-bold">
                {{ trackedClubs().length }} Clubs Active
              </span>
            </div>

            <!-- Tracked Clubs Table -->
            @if (isLoadingTrackedClubs()) {
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
                      <th class="py-3 px-4">Target Channel</th>
                      <th class="py-3 px-4 text-center">Status</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/80">
                    @for (tc of trackedClubs(); track tc.clubId) {
                      <tr class="hover:bg-slate-800/30 transition">
                        <td class="py-3 px-4">
                          <div class="font-bold text-white flex items-center gap-2">
                            <span>{{ tc.clubName || 'Unknown Club' }}</span>
                            @if (tc.clubId === clubId()) {
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
                        <td class="py-3 px-4">
                          <select
                            [ngModel]="tc.channelId || null"
                            (ngModelChange)="onUpdateClubChannel(tc, $event)"
                            class="bg-[#11192e] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option [value]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Settings)' : '(from Server Settings)' }}</option>
                            @for (c of availableChannels(); track c.id) {
                              <option [value]="c.id"># {{ c.name }}</option>
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
                              (click)="switchActiveClubTo(tc, 'matches')"
                              class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 transition cursor-pointer"
                              title="View recent match scorecard & timeline"
                            >
                              ⚽ Matches
                            </button>
                            <button
                              type="button"
                              (click)="switchActiveClubTo(tc, 'roster')"
                              class="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-500/30 transition cursor-pointer"
                              title="View player squad roster & stats"
                            >
                              👥 Squad
                            </button>
                            <button
                              type="button"
                              (click)="switchActiveClubTo(tc, 'players')"
                              class="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30 transition cursor-pointer"
                              title="View linked Discord registrations"
                            >
                              🎮 Players
                            </button>
                            @if (isAdmin()) {
                              <button
                                type="button"
                                (click)="onDeleteTrackedClub(tc.clubId)"
                                [disabled]="trackedClubs().length <= 1"
                                class="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ml-1"
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

            <!-- EA Live Search Form -->
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

              <!-- Search Results -->
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
                              <option [value]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Settings)' : '(from Server Settings)' }}</option>
                              @for (c of availableChannels(); track c.id) {
                                <option [value]="c.id"># {{ c.name }}</option>
                              }
                            </select>
                          </div>

                          <div class="pt-3.5">
                            @if (isTracked(club.clubId)) {
                              <button
                                type="button"
                                (click)="switchActiveClubById(club.clubId)"
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

            <!-- Manual Input Section (Collapsible) -->
            @if (showManualAdd()) {
              <div class="border-t border-slate-800/80 pt-4 mt-2 space-y-3 bg-[#11192e]/40 p-4 rounded-xl border border-slate-800">
                <div class="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span>Manual Club Registration</span>
                  <span class="text-[10px] font-normal text-slate-500">(Use if club is not appearing in EA search)</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <label class="block text-xs font-bold text-slate-300 mb-1">Target Discord Channel</label>
                    <select
                      [(ngModel)]="newClubChannelId"
                      class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option [value]="null">Default {{ defaultLiveResultsChannelName() ? '(#' + defaultLiveResultsChannelName() + ' from Settings)' : '(from Server Settings)' }}</option>
                      @for (c of availableChannels(); track c.id) {
                        <option [value]="c.id"># {{ c.name }}</option>
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
      }

      <!-- Player Stats Modal -->
      @if (playerStatsData()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-[#16213e] border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 class="text-base font-black text-white flex items-center gap-2">
                  <span>⭐</span>
                  <span>{{ playerStatsData().player?.eaPlayerName || playerStatsData().player?.gamertag || 'Player Stats' }}</span>
                </h3>
                <span class="text-xs text-emerald-400 font-semibold">{{ playerStatsData().player?.preferredPos || 'PRO CLUBS' }}</span>
              </div>
              <button (click)="playerStatsData.set(null)" class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Games</div>
                <div class="text-lg font-black text-white mt-1">{{ playerStatsData().totals?.matchesPlayed || 0 }}</div>
              </div>
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Goals</div>
                <div class="text-lg font-black text-emerald-400 mt-1">{{ playerStatsData().totals?.goals || 0 }}</div>
              </div>
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Assists</div>
                <div class="text-lg font-black text-sky-400 mt-1">{{ playerStatsData().totals?.assists || 0 }}</div>
              </div>
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Avg Rating</div>
                <div class="text-lg font-black text-amber-400 mt-1">{{ playerStatsData().averages?.rating || '-' }}</div>
              </div>
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Pass Rate</div>
                <div class="text-lg font-black text-white mt-1">{{ playerStatsData().averages?.passSuccessRate || 0 }}%</div>
              </div>
              <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Tackle Rate</div>
                <div class="text-lg font-black text-white mt-1">{{ playerStatsData().averages?.tackleSuccessRate || 0 }}%</div>
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                (click)="playerStatsData.set(null)"
                class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.15s ease-out forwards;
    }
  `],
})
export class EaTrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly guildStore = inject(GuildStore);

  readonly isAdmin = computed(() => Boolean(this.api.getSessionToken()));

  readonly defaultCrest =
    'https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg';

  // State
  readonly activeTab = signal<'clubs' | 'matches' | 'roster' | 'players'>('clubs');
  readonly config = signal<any>(null);
  readonly clubInfo = signal<any>(null);
  readonly overallStats = signal<any>(null);
  readonly matches = signal<any[]>([]);
  readonly members = signal<any[]>([]);
  readonly registeredPlayers = signal<RegisteredDiscordPlayer[]>([]);
  readonly auditLogs = signal<PlayerRegistrationAudit[]>([]);
  readonly isLoadingPlayers = signal<boolean>(false);
  readonly isRegistering = signal<boolean>(false);
  readonly playerStatsData = signal<any>(null);

  readonly trackedClubs = signal<any[]>([]);
  readonly isLoadingTrackedClubs = signal<boolean>(false);
  readonly isAddingClub = signal<boolean>(false);

  newClubId = '';
  newClubName = '';
  newClubPlatform = 'common-gen5';
  newClubChannelId: string | null = null;

  newRegUserId = '';
  newRegEaName = '';
  newRegPos = 'ST';

  readonly isLoadingMatches = signal<boolean>(false);
  readonly isLoadingMembers = signal<boolean>(false);
  readonly isActionRunning = signal<boolean>(false);
  readonly isSearching = signal<boolean>(false);
  readonly hasSearched = signal<boolean>(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly expandedMatchId = signal<string | null>(null);

  // Search & Track states
  readonly showManualAdd = signal<boolean>(false);
  readonly searchClubChannels = signal<Record<string, string | null>>({});
  readonly searchQuery = signal<string>('');
  readonly searchResults = signal<any[]>([]);

  // Computed properties
  readonly clubName = computed(() => this.config()?.clubName || 'RYVL Esports');
  readonly clubId = computed(() => this.config()?.clubId || '128199');
  readonly platform = computed(() => this.config()?.platform || 'common-gen5');

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

  // Overall Stats Computeds
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
    return data?.skillRating || 'N/A';
  });

  readonly bestDivision = computed(() => {
    const s = this.overallStats();
    const data = Array.isArray(s) && s.length > 0 ? s[0] : s;
    return data?.bestDivision != null ? `Div ${data.bestDivision}` : 'Div 1';
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
    this.route.queryParamMap.subscribe((params) => {
      const gId = params.get('guildId') || this.guildStore.activeGuildId() || 'default';
      const tab = params.get('tab');
      if (tab === 'players') {
        this.activeTab.set('players');
      } else if (tab === 'matches') {
        this.activeTab.set('matches');
      } else if (tab === 'roster') {
        this.activeTab.set('roster');
      } else if (tab === 'clubs') {
        this.activeTab.set('clubs');
      }
      this.loadAllData(gId);
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

      // Load matches
      this.loadMatches(guildId);

      // Load members
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
    if (this.expandedMatchId() === matchId) {
      this.expandedMatchId.set(null);
    } else {
      this.expandedMatchId.set(matchId);
    }
  }

  onCrestError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = this.defaultCrest;
    }
  }

  selectedChannelForClub(clubId: string | number): string | null {
    const id = String(clubId);
    if (this.searchClubChannels()[id] !== undefined) {
      return this.searchClubChannels()[id];
    }
    const guild = this.guildStore.activeGuild();
    return guild?.defaultLiveResultsChannelId || guild?.settings?.defaultChannelId || null;
  }

  setSelectedChannelForClub(clubId: string | number, channelId: string | null): void {
    const id = String(clubId);
    this.searchClubChannels.update((prev) => ({ ...prev, [id]: channelId }));
  }

  isTracked(clubId: string | number): boolean {
    return this.trackedClubs().some((c) => String(c.clubId) === String(clubId));
  }

  async addClubFromSearch(club: any): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
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
      this.showToast(`Club "${club.name}" added to tracker!`, 'success');
      await this.loadTrackedClubs(guildId);
    } catch (err: any) {
      this.showToast(`Failed to add club: ${err.message}`, 'error');
    } finally {
      this.isAddingClub.set(false);
    }
  }

  onSelectTab(tab: 'matches' | 'roster' | 'players' | 'clubs'): void {
    this.activeTab.set(tab);
    if (tab === 'players') {
      const gId = this.guildStore.activeGuildId() || 'default';
      this.loadRegisteredPlayers(gId);
    } else if (tab === 'clubs') {
      const gId = this.guildStore.activeGuildId() || 'default';
      this.loadTrackedClubs(gId);
    }
  }

  async searchClubs(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const query = this.searchQuery().trim();
    if (!guildId || !query) return;

    this.isSearching.set(true);
    this.hasSearched.set(true);
    try {
      const results = await this.api.searchEaClubs(guildId, query);
      this.searchResults.set(results || []);
    } catch (err: any) {
      this.showToast(`Search failed: ${err.message}`, 'error');
    } finally {
      this.isSearching.set(false);
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
      });
      this.config.set(updated);
      this.showToast(`Tracked club changed to ${club.name}!`, 'success');
      this.searchResults.set([]);
      this.hasSearched.set(false);
      this.searchQuery.set('');
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

  async linkPlayer(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.newRegUserId.trim() || !this.newRegEaName.trim()) return;

    this.isRegistering.set(true);
    try {
      await this.api.registerPlayer(guildId, {
        discordUserId: this.newRegUserId.trim(),
        eaPlayerName: this.newRegEaName.trim(),
        preferredPos: this.newRegPos || undefined,
      });
      this.showToast(`Linked Discord user to ${this.newRegEaName}!`, 'success');
      this.newRegUserId = '';
      this.newRegEaName = '';
      await this.loadRegisteredPlayers(guildId);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to register player.', 'error');
    } finally {
      this.isRegistering.set(false);
    }
  }

  async unlinkPlayer(discordUserId: string): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !discordUserId) return;

    try {
      await this.api.unregisterPlayer(guildId, discordUserId);
      this.showToast('Unlinked player registration.', 'success');
      await this.loadRegisteredPlayers(guildId);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to unregister player.', 'error');
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

  getMemberDisplayName(userId: string): string {
    const m = this.guildMembers().find((member) => member.id === userId);
    return m?.displayName || m?.username || userId;
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

  async loadTrackedClubs(guildId: string): Promise<void> {
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

  async onAddTrackedClub(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
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
      this.showToast(`Club "${this.newClubName}" added to tracker!`, 'success');
      this.newClubId = '';
      this.newClubName = '';
      this.newClubChannelId = null;
      await this.loadTrackedClubs(guildId);
    } catch (err: any) {
      this.showToast(`Failed to add club: ${err.message}`, 'error');
    } finally {
      this.isAddingClub.set(false);
    }
  }

  async onUpdateClubChannel(club: any, channelId: string | null): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      await this.api.updateTrackedClub(guildId, club.clubId, {
        channelId: channelId || undefined,
      });
      this.showToast('Club announcement channel updated.', 'success');
      await this.loadTrackedClubs(guildId);
    } catch (err: any) {
      this.showToast(`Failed to update channel: ${err.message}`, 'error');
    }
  }

  async onToggleClubStatus(club: any): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      await this.api.updateTrackedClub(guildId, club.clubId, {
        enabled: !club.enabled,
      });
      this.showToast(`Club tracking ${!club.enabled ? 'activated' : 'paused'}.`, 'success');
      await this.loadTrackedClubs(guildId);
    } catch (err: any) {
      this.showToast(`Failed to toggle status: ${err.message}`, 'error');
    }
  }

  async onDeleteTrackedClub(clubId: string): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      await this.api.removeTrackedClub(guildId, clubId);
      this.showToast('Tracked club removed.', 'success');
      await this.loadTrackedClubs(guildId);
    } catch (err: any) {
      this.showToast(`Failed to remove club: ${err.message}`, 'error');
    }
  }

  async switchActiveClub(club: any): Promise<void> {
    await this.switchActiveClubTo(club, 'matches');
  }

  async switchActiveClubTo(
    club: any,
    targetTab: 'clubs' | 'matches' | 'roster' | 'players' = 'matches',
  ): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      if (String(club.clubId) !== String(this.clubId())) {
        await this.selectClub({
          clubId: club.clubId,
          name: club.clubName || club.name,
        });
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
      await this.switchActiveClub(club);
    }
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      this.toast.set(null);
    }, 4500);
  }
}
