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
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { TournamentInstance } from '../../core/models';

@Component({
  selector: 'app-admin-tournaments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 pb-12">
      <!-- Toast Notification -->
      @if (toast()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all"
          [ngClass]="toast()!.type === 'error' ? 'bg-rose-900 border border-rose-600 text-rose-100' : 'bg-emerald-900 border border-emerald-600 text-emerald-100'"
        >
          <span>{{ toast()!.text }}</span>
          <button (click)="toast.set(null)" class="text-xs opacity-75 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      }

      <!-- Page Header -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#1a274a] to-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-2xl">🏆</span>
              <h1 class="text-2xl font-black text-white tracking-tight">Tournaments & FC Draft</h1>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                MultiBots & Draft
              </span>
            </div>
            <p class="text-sm text-slate-400 mt-1">
              Organize both MultiBots-style Standard Tournaments (auto-channels #info-rules, #announcements, #registration, #fixtures-results, #table-standings, #tournament-chat) and FC Draft Tournaments with live Discord draft wheel, 3-5-2 / 3-1-4-2 formations, and jokers.
            </p>
          </div>

          <button
            (click)="showCreateModal.set(true)"
            class="px-4 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-extrabold text-xs shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
          >
            <span>➕</span>
            <span>New Tournament</span>
          </button>
        </div>
      </div>

      <!-- Tournament Selector & Quick Overview -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-1">
          <label class="text-xs font-bold text-slate-400 shrink-0 uppercase tracking-wider">Active Tournament:</label>
          <select
            [ngModel]="selectedTournamentId()"
            (ngModelChange)="onSelectTournament($event)"
            class="bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 min-w-[200px]"
          >
            @if (tournaments().length === 0) {
              <option [ngValue]="null">No tournaments created yet</option>
            }
            @for (t of tournaments(); track t.id) {
              <option [value]="t.id">{{ t.name }} [{{ t.type || 'STANDARD' }} - {{ t.status }}]</option>
            }
          </select>
        </div>

        @if (activeTournament()) {
          <div class="flex items-center gap-2 flex-wrap">
            <button
              (click)="provisionDiscordChannels()"
              [disabled]="isProvisioning()"
              class="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-xs border border-indigo-500/40 transition flex items-center gap-2"
              title="Creates Discord Category with #chat-turneu, #rezultate, #clasament, #rosters, #inscriere-turneu"
            >
              @if (isProvisioning()) {
                <span class="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Setting up Discord...</span>
              } @else {
                <span>🤖</span>
                <span>Provision Discord Channels</span>
              }
            </button>
          </div>
        }
      </div>

      @if (activeTournament()) {
        <!-- Sub-Navigation Tabs -->
        <div class="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            (click)="activeTab.set('overview')"
            class="px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer"
            [ngClass]="activeTab() === 'overview' ? 'bg-[#5865F2] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <span>📊</span>
            <span>Overview & Settings</span>
          </button>

          <button
            type="button"
            (click)="activeTab.set('signups')"
            class="px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer"
            [ngClass]="activeTab() === 'signups' ? 'bg-[#5865F2] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <span>📝</span>
            <span>Signups ({{ activeTournament()?.signups?.length || 0 }})</span>
          </button>

          <button
            type="button"
            (click)="activeTab.set('results')"
            class="px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer"
            [ngClass]="activeTab() === 'results' ? 'bg-[#5865F2] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <span>⚽</span>
            <span>Record Results</span>
          </button>

          <button
            type="button"
            (click)="activeTab.set('standings')"
            class="px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer"
            [ngClass]="activeTab() === 'standings' ? 'bg-[#5865F2] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <span>📈</span>
            <span>Standings & Graphic Card</span>
          </button>
        </div>

        <!-- Tab 1: Overview -->
        @if (activeTab() === 'overview') {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>📋</span>
                <span>Tournament Details</span>
              </h3>
              <div class="space-y-2 text-xs">
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Name</span>
                  <span class="font-bold text-white">{{ activeTournament()?.name }}</span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Status</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
                    {{ activeTournament()?.status }}
                  </span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Formation</span>
                  <span class="font-bold text-white">{{ activeTournament()?.formation }}</span>
                </div>
                <div class="flex justify-between py-1.5">
                  <span class="text-slate-400">Bracket Sizing</span>
                  <span class="font-bold text-emerald-400">Auto (8 / 16 / 32 teams)</span>
                </div>
              </div>
            </div>

            <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 md:col-span-2">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🤖</span>
                <span>Provisioned Discord Category & Channels</span>
              </h3>
              @if (activeTournament()?.categoryId) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">Category ID</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.categoryId }}</div>
                  </div>
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">#chat-turneu</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.chatChannelId || 'Pending' }}</div>
                  </div>
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">#rezultate</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.resultsChannelId || 'Pending' }}</div>
                  </div>
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">#clasament</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.standingsChannelId || 'Pending' }}</div>
                  </div>
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">#rosters</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.rostersChannelId || 'Pending' }}</div>
                  </div>
                  <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">#inscriere-turneu</div>
                    <div class="font-mono text-white mt-0.5">{{ activeTournament()?.signupChannelId || 'Pending' }}</div>
                  </div>
                </div>
              } @else {
                <div class="p-6 bg-[#11192e] rounded-xl border border-slate-800 text-center space-y-2">
                  <p class="text-xs text-slate-400">
                    No Discord channels have been provisioned yet for this tournament.
                  </p>
                  <button
                    (click)="provisionDiscordChannels()"
                    class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition"
                  >
                    Provision Discord Category & Channels Now
                  </button>
                </div>
              }
            </div>
          </div>
        }

        <!-- Tab 2: Signups -->
        @if (activeTab() === 'signups') {
          <div class="space-y-6">
            <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-white">Player Registrations</h3>
                  <p class="text-xs text-slate-400">Registered draft players and their preferred positions</p>
                </div>
                <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
                  {{ activeTournament()?.signups?.length || 0 }} Players
                </span>
              </div>

              @if (!activeTournament()?.signups || activeTournament()!.signups!.length === 0) {
                <div class="p-12 text-center text-slate-400 space-y-2">
                  <div class="text-3xl">📝</div>
                  <h4 class="text-sm font-bold text-white">No Signups Yet</h4>
                  <p class="text-xs">Players can sign up using the interactive embed button in Discord (#inscriere-turneu).</p>
                </div>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-[#16213e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th class="py-3 px-4">Player</th>
                        <th class="py-3 px-4">Gamertag</th>
                        <th class="py-3 px-4 text-center">Primary Pos</th>
                        <th class="py-3 px-4 text-center">Secondary Pos</th>
                        <th class="py-3 px-4">Notes</th>
                        <th class="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/80">
                      @for (s of activeTournament()?.signups; track s.userId) {
                        <tr class="hover:bg-slate-800/30 transition">
                          <td class="py-3 px-4 font-bold text-white">{{ s.displayName || s.userId }}</td>
                          <td class="py-3 px-4 font-mono text-slate-300">{{ s.gamertag }}</td>
                          <td class="py-3 px-4 text-center font-extrabold text-amber-400">{{ s.pos1 }}</td>
                          <td class="py-3 px-4 text-center font-semibold text-slate-400">{{ s.pos2 || '-' }}</td>
                          <td class="py-3 px-4 text-slate-400 truncate max-w-xs">{{ s.notes || '-' }}</td>
                          <td class="py-3 px-4 text-right">
                            <button
                              (click)="removeSignup(s.userId)"
                              class="text-rose-400 hover:text-rose-300 font-bold text-xs"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        }

        <!-- Tab 3: Record Results -->
        @if (activeTab() === 'results') {
          <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div class="md:col-span-5 bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>⚽</span>
                <span>Enter Match Score</span>
              </h3>

              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Home Team Name</label>
                  <input
                    type="text"
                    [(ngModel)]="matchHomeTeam"
                    placeholder="e.g. Team Alpha"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Away Team Name</label>
                  <input
                    type="text"
                    [(ngModel)]="matchAwayTeam"
                    placeholder="e.g. Team Beta"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">Home Score</label>
                    <input
                      type="number"
                      [(ngModel)]="matchHomeScore"
                      min="0"
                      class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white text-center font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">Away Score</label>
                    <input
                      type="number"
                      [(ngModel)]="matchAwayScore"
                      min="0"
                      class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white text-center font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  (click)="submitResult()"
                  [disabled]="isSubmittingResult() || !matchHomeTeam || !matchAwayTeam"
                  class="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  @if (isSubmittingResult()) {
                    <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span>Recording...</span>
                  } @else {
                    <span>Save Result & Update Standings</span>
                  }
                </button>
              </div>
            </div>

            <div class="md:col-span-7 bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
                <h3 class="text-sm font-bold text-white">Recorded Matches</h3>
                <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
                  {{ activeTournament()?.matches?.length || 0 }} Played
                </span>
              </div>

              @if (!activeTournament()?.matches || activeTournament()!.matches!.length === 0) {
                <div class="p-12 text-center text-slate-400 space-y-2">
                  <div class="text-2xl">⚽</div>
                  <h4 class="text-sm font-bold text-white">No Matches Recorded</h4>
                  <p class="text-xs">Results entered here or submitted via Discord (#rezultate) will appear here.</p>
                </div>
              } @else {
                <div class="divide-y divide-slate-800/80">
                  @for (m of activeTournament()?.matches; track $index) {
                    <div class="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition text-xs">
                      <div class="font-bold text-white flex-1 text-right">{{ m.homeTeam }}</div>
                      <div class="px-4 py-1 mx-3 rounded-lg bg-[#11192e] border border-slate-700 font-extrabold text-white text-center min-w-[60px]">
                        {{ m.homeScore }} - {{ m.awayScore }}
                      </div>
                      <div class="font-bold text-white flex-1 text-left">{{ m.awayTeam }}</div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Tab 4: Standings & Graphic Card -->
        @if (activeTab() === 'standings') {
          <div class="space-y-6">
            <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>🖼️</span>
                    <span>Live Standings Graphic</span>
                  </h3>
                  <p class="text-xs text-slate-400">High-resolution standings card generated dynamically for Discord announcements.</p>
                </div>
                <a
                  [href]="standingsImageUrl()"
                  target="_blank"
                  class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
                >
                  Open Full Image
                </a>
              </div>

              <div class="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-4">
                <img
                  [src]="standingsImageUrl()"
                  alt="Standings Table"
                  class="max-w-full h-auto rounded-lg shadow-2xl"
                />
              </div>
            </div>
          </div>
        }
      } @else {
        <!-- Empty State: No Tournament Selected -->
        <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-16 text-center text-slate-400 space-y-4 shadow-xl">
          <div class="text-4xl">🏆</div>
          <h2 class="text-lg font-bold text-white">No Tournament Selected</h2>
          <p class="text-xs max-w-md mx-auto">
            Create a new tournament to start hosting FC Draft events with automated discord channels and graphics.
          </p>
          <button
            (click)="showCreateModal.set(true)"
            class="px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-extrabold text-xs shadow-lg transition inline-flex items-center gap-2"
          >
            <span>➕</span>
            <span>Create First Tournament</span>
          </button>
        </div>
      }

      <!-- Create Tournament Modal -->
      @if (showCreateModal()) {
        <div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-[#16213e] border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🏆</span>
                <span>Create New Tournament</span>
              </h3>
              <button (click)="showCreateModal.set(false)" class="text-slate-400 hover:text-white font-bold text-xs">✕</button>
            </div>

            <div class="space-y-3">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Tournament Format</label>
                <select
                  [(ngModel)]="newTournamentType"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="STANDARD">Standard Tournament (MultiBots style)</option>
                  <option value="DRAFT">FC Draft Tournament (Draft Wheel & Formations)</option>
                </select>
                <p class="text-[10px] text-slate-400 mt-1">
                  @if (newTournamentType === 'STANDARD') {
                    Creates a Discord category <code>🏆 [Name]</code> first, then nests inside it: #info-rules, #announcements, #registration, #fixtures-results, #table-standings, and #tournament-chat.
                  } @else {
                    Creates a Discord category <code>🏆 [Name]</code> first, then nests inside it: #draft-wheel for interactive Discord wheel spins, joker rules, and custom formations.
                  }
                </p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Tournament Name</label>
                <input
                  type="text"
                  [(ngModel)]="newTournamentName"
                  [placeholder]="newTournamentType === 'STANDARD' ? 'e.g. RYVL Champions League Ed. 1' : 'e.g. Cupa României Draft Ed. 1'"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              @if (newTournamentType === 'DRAFT') {
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Tactical Formation</label>
                  <select
                    [(ngModel)]="newTournamentFormation"
                    class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="3-1-4-2">3-1-4-2 (Holding CDM & Twin Strikers)</option>
                    <option value="3-5-2">3-5-2 (Twin Strikers, CAM & Midfield)</option>
                  </select>
                </div>
              }
            </div>

            <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                (click)="showCreateModal.set(false)"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                (click)="createTournament()"
                [disabled]="isCreating() || !newTournamentName"
                class="px-5 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs shadow-lg transition flex items-center gap-2 disabled:opacity-50"
              >
                @if (isCreating()) {
                  <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Creating...</span>
                } @else {
                  <span>Create Tournament</span>
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminTournamentsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly tournaments = signal<TournamentInstance[]>([]);
  readonly selectedTournamentId = signal<string | null>(null);
  readonly activeTab = signal<'overview' | 'signups' | 'results' | 'standings'>('overview');

  readonly isProvisioning = signal<boolean>(false);
  readonly isCreating = signal<boolean>(false);
  readonly isSubmittingResult = signal<boolean>(false);
  readonly showCreateModal = signal<boolean>(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form states for new tournament
  newTournamentType: 'STANDARD' | 'DRAFT' = 'STANDARD';
  newTournamentName = '';
  newTournamentFormation = '3-1-4-2';
  newTournamentTeams = 4;

  // Form states for match result
  matchHomeTeam = '';
  matchAwayTeam = '';
  matchHomeScore = 0;
  matchAwayScore = 0;

  readonly activeTournament = computed(() => {
    const id = this.selectedTournamentId();
    if (!id) return null;
    return this.tournaments().find((t) => t.id === id) || null;
  });

  readonly standingsImageUrl = computed(() => {
    const gId = this.guildStore.activeGuildId();
    const tId = this.selectedTournamentId();
    if (!gId || !tId) return '';
    return `${this.api.baseUrl}/api/guilds/${gId}/tournaments/${tId}/standings-image?t=${Date.now()}`;
  });

  ngOnInit(): void {
    const guildId = this.guildStore.activeGuildId();
    if (guildId) {
      this.loadTournaments(guildId);
    }
  }

  async loadTournaments(guildId: string): Promise<void> {
    try {
      const list = await this.api.getTournaments(guildId);
      this.tournaments.set(list || []);
      if (list && list.length > 0 && !this.selectedTournamentId()) {
        this.selectedTournamentId.set(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load tournaments:', err);
    }
  }

  onSelectTournament(id: string): void {
    this.selectedTournamentId.set(id);
  }

  async createTournament(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.newTournamentName.trim()) return;

    this.isCreating.set(true);
    try {
      const created = await this.api.createTournament(guildId, {
        name: this.newTournamentName.trim(),
        type: this.newTournamentType,
        formation: this.newTournamentFormation,
        numTeams: Number(this.newTournamentTeams) || 4,
      });

      this.tournaments.update((list) => [created, ...list]);
      this.selectedTournamentId.set(created.id);
      this.showCreateModal.set(false);
      this.newTournamentName = '';
      this.showToast('Tournament created successfully!', 'success');
    } catch (err: any) {
      this.showToast(err.message || 'Failed to create tournament.', 'error');
    } finally {
      this.isCreating.set(false);
    }
  }

  async provisionDiscordChannels(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const tournamentId = this.selectedTournamentId();
    if (!guildId || !tournamentId) return;

    this.isProvisioning.set(true);
    try {
      const res = await this.api.provisionTournamentDiscord(guildId, tournamentId);
      this.showToast('Discord category & channels provisioned successfully!', 'success');
      await this.loadTournaments(guildId);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to provision Discord channels.', 'error');
    } finally {
      this.isProvisioning.set(false);
    }
  }

  async removeSignup(userId: string): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const tournamentId = this.selectedTournamentId();
    if (!guildId || !tournamentId) return;

    try {
      await this.api.removeTournamentSignup(guildId, tournamentId, userId);
      this.showToast('Player signup removed.', 'success');
      await this.loadTournaments(guildId);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to remove player signup.', 'error');
    }
  }

  async submitResult(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const tournamentId = this.selectedTournamentId();
    if (!guildId || !tournamentId || !this.matchHomeTeam || !this.matchAwayTeam) return;

    this.isSubmittingResult.set(true);
    try {
      await this.api.recordTournamentResult(guildId, tournamentId, {
        homeTeam: this.matchHomeTeam.trim(),
        awayTeam: this.matchAwayTeam.trim(),
        homeScore: Number(this.matchHomeScore) || 0,
        awayScore: Number(this.matchAwayScore) || 0,
      });

      this.showToast('Result saved and standings updated!', 'success');
      this.matchHomeTeam = '';
      this.matchAwayTeam = '';
      this.matchHomeScore = 0;
      this.matchAwayScore = 0;
      await this.loadTournaments(guildId);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to record result.', 'error');
    } finally {
      this.isSubmittingResult.set(false);
    }
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      this.toast.set(null);
    }, 4000);
  }
}
