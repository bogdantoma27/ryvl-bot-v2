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
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';

@Component({
  selector: 'app-ea-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6 pb-12">
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
              <p class="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>Club ID: <code class="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">{{ clubId() }}</code></span>
                <span>•</span>
                <span>Target Channel:
                  @if (targetChannelName()) {
                    <span class="text-indigo-400 font-medium">#{{ targetChannelName() }}</span>
                  } @else {
                    <span class="text-amber-400 italic">Not configured</span>
                  }
                </span>
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
                (click)="activeTab.set('settings')"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Setup</span>
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
      <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          (click)="activeTab.set('matches')"
          class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          [ngClass]="activeTab() === 'matches' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
        >
          Recent Matches ({{ matches().length }})
        </button>

        <button
          type="button"
          (click)="activeTab.set('roster')"
          class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          [ngClass]="activeTab() === 'roster' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
        >
          Squad & Member Stats ({{ members().length }})
        </button>

        @if (isAdmin()) {
          <button
            type="button"
            (click)="activeTab.set('settings')"
            class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            [ngClass]="activeTab() === 'settings' ? 'bg-[#00d26a] text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
          >
            Tracker Settings & Club Switch
          </button>
        }
      </div>

      <!-- Tab 1: Recent Matches -->
      @if (activeTab() === 'matches') {
        @if (isLoadingMatches()) {
          <div class="py-16 text-center text-slate-400 space-y-3">
            <div class="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs font-medium">Fetching recent matches from EA Sports Pro Clubs servers...</p>
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

                    <span class="text-slate-400 font-semibold">{{ match.matchType || 'League Match' }}</span>
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

      <!-- Tab 3: Tracker Settings & Club Search -->
      @if (isAdmin() && activeTab() === 'settings') {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Discord Notification Channel & Controls Card -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div class="border-b border-slate-800 pb-4">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>Automated Match Notifications</span>
              </h3>
              <p class="text-xs text-slate-400 mt-1">
                Configure which channel receives match statistics embeds whenever the club finishes a match.
              </p>
            </div>

            <!-- Auto-Tracking Enabled Switch -->
            <div class="flex items-center justify-between p-3.5 bg-[#11192e] rounded-xl border border-slate-800">
              <div>
                <div class="text-xs font-bold text-white">Enable Background Poller</div>
                <div class="text-[11px] text-slate-400">Polls EA servers every 90 seconds for newly finished matches</div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  [checked]="editEnabled()"
                  (change)="editEnabled.set(!editEnabled())"
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <!-- Target Discord Channel Dropdown -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-slate-300">Target Discord Text Channel</label>
              <select
                [ngModel]="editChannelId()"
                (ngModelChange)="editChannelId.set($event)"
                class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer"
              >
                <option [value]="null">-- Select a Text Channel --</option>
                @for (c of availableChannels(); track c.id) {
                  <option [value]="c.id"># {{ c.name }}</option>
                }
              </select>
              <p class="text-[11px] text-slate-500">The bot will post victory, defeat, and player ratings here.</p>
            </div>

            <!-- Save Settings Button -->
            <div class="pt-2">
              <button
                type="button"
                (click)="saveSettings()"
                [disabled]="isActionRunning()"
                class="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {{ isActionRunning() ? 'Saving...' : 'Save Configuration' }}
              </button>
            </div>
          </div>

          <!-- Change Club / Search EA Leaderboards Card -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div class="border-b border-slate-800 pb-4">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Track a Different Club</span>
              </h3>
              <p class="text-xs text-slate-400 mt-1">
                Search for any EA Sports Pro Clubs team name across global leaderboards.
              </p>
            </div>

            <!-- Search Input Box -->
            <div class="flex items-center gap-2">
              <input
                type="text"
                [ngModel]="searchQuery()"
                (ngModelChange)="searchQuery.set($event)"
                (keyup.enter)="searchClubs()"
                placeholder="e.g. RYVL Esports, Primetime..."
                class="flex-1 bg-[#11192e] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                (click)="searchClubs()"
                [disabled]="isSearching() || !searchQuery().trim()"
                class="px-4 py-2 rounded-xl bg-[#1f2e54] hover:bg-[#283b6b] text-white text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                {{ isSearching() ? 'Searching...' : 'Search' }}
              </button>
            </div>

            <!-- Search Results List -->
            @if (searchResults().length > 0) {
              <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                <div class="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Search Results</div>
                @for (res of searchResults(); track res.clubId) {
                  <div class="p-3 bg-[#11192e] border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition">
                    <div class="flex items-center gap-3">
                      <img
                        [src]="res.crestUrl || defaultCrest"
                        alt="Crest"
                        class="w-8 h-8 object-contain rounded-lg bg-slate-900 p-0.5"
                      />
                      <div>
                        <div class="text-xs font-bold text-white">{{ res.name }}</div>
                        <div class="text-[10px] text-slate-400">
                          ID: {{ res.clubId }} • Div {{ res.currentDivision }} • {{ res.wins }}W / {{ res.losses }}L
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      (click)="selectClub(res)"
                      class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold transition cursor-pointer"
                    >
                      Select
                    </button>
                  </div>
                }
              </div>
            } @else if (hasSearched() && searchResults().length === 0) {
              <div class="text-xs text-slate-400 text-center py-4 bg-[#11192e] rounded-xl border border-slate-800">
                No clubs found matching "{{ searchQuery() }}".
              </div>
            }
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
  readonly activeTab = signal<'matches' | 'roster' | 'settings'>('matches');
  readonly config = signal<any>(null);
  readonly clubInfo = signal<any>(null);
  readonly overallStats = signal<any>(null);
  readonly matches = signal<any[]>([]);
  readonly members = signal<any[]>([]);

  readonly isLoadingMatches = signal<boolean>(false);
  readonly isLoadingMembers = signal<boolean>(false);
  readonly isActionRunning = signal<boolean>(false);
  readonly isSearching = signal<boolean>(false);
  readonly hasSearched = signal<boolean>(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly expandedMatchId = signal<string | null>(null);

  // Form states for settings
  readonly editEnabled = signal<boolean>(true);
  readonly editChannelId = signal<string | null>(null);
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

  readonly targetChannelName = computed(() => {
    const chId = this.config()?.channelId;
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
      this.loadAllData(gId);
    });
  }

  async loadAllData(guildId: string): Promise<void> {
    if (!this.isAdmin() && this.activeTab() === 'settings') {
      this.activeTab.set('matches');
    }

    try {
      const configRes = await this.api.getEaConfig(guildId);
      this.config.set(configRes.config);
      this.clubInfo.set(configRes.clubInfo);
      this.overallStats.set(configRes.overallStats);

      this.editEnabled.set(configRes.config?.enabled ?? true);
      this.editChannelId.set(configRes.config?.channelId || null);

      // Load matches
      this.loadMatches(guildId);

      // Load members
      this.loadMembers(guildId);
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

  async saveSettings(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isActionRunning.set(true);
    try {
      const updated = await this.api.updateEaConfig(guildId, {
        enabled: this.editEnabled(),
        channelId: this.editChannelId(),
      });
      this.config.set(updated);
      this.showToast('Tracker settings saved successfully!', 'success');
    } catch (err: any) {
      this.showToast(`Failed to save settings: ${err.message}`, 'error');
    } finally {
      this.isActionRunning.set(false);
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

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      this.toast.set(null);
    }, 4500);
  }
}
