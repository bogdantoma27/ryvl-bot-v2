import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { TournamentInstance, TournamentMatch } from '../../core/models';

type Tab = 'overview' | 'signups' | 'draft' | 'results' | 'standings';

const STATUS_LABELS: Record<string, string> = {
  SIGNUPS_OPEN: 'Signups open',
  SIGNUPS_CLOSED: 'Signups closed',
  DRAFTING: 'Drafting',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
};

@Component({
  selector: 'app-admin-tournaments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 pb-12">
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
            </div>
            <p class="text-sm text-slate-400 mt-1">
              Standard tournaments (teams sign up, auto 8/16/32 bracket, groups of 4 then knockouts) and FC Draft tournaments
              (players and managers sign up, managers draft on the Discord wheel). Everything here mirrors the bot's channels.
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

      <!-- Tournament selector -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-1">
          <label class="text-xs font-bold text-slate-400 shrink-0 uppercase tracking-wider">Tournament:</label>
          <select
            [ngModel]="selectedTournamentId()"
            (ngModelChange)="selectedTournamentId.set($event)"
            class="bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 min-w-[200px]"
          >
            @if (tournaments().length === 0) {
              <option [ngValue]="null">No tournaments created yet</option>
            }
            @for (t of tournaments(); track t.id) {
              <option [ngValue]="t.id">{{ t.name }} [{{ t.type === 'DRAFT' ? 'Draft' : 'Standard' }} · {{ statusLabel(t.status) }}]</option>
            }
          </select>
        </div>

        @if (activeTournament(); as t) {
          <div class="flex items-center gap-2 flex-wrap">
            @if (canChangeSignups()) {
              <button (click)="toggleSignups()" [disabled]="busy()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition disabled:opacity-50">
                {{ t.status === 'SIGNUPS_OPEN' ? '🔒 Close signups' : '🟢 Reopen signups' }}
              </button>
              <button (click)="startTournament()" [disabled]="busy()" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold text-xs transition disabled:opacity-50">
                {{ t.type === 'DRAFT' ? '🎡 Start draft' : '🚀 Start tournament' }}
              </button>
            }
            @if (t.categoryId) {
              <button (click)="refreshDiscord()" [disabled]="busy()" class="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-xs border border-indigo-500/40 transition disabled:opacity-50">
                🔄 Refresh Discord panels
              </button>
            } @else {
              <button (click)="provisionDiscordChannels()" [disabled]="busy()" class="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-xs border border-indigo-500/40 transition disabled:opacity-50">
                🤖 Create Discord channels
              </button>
            }
          </div>
        }
      </div>

      @if (activeTournament(); as t) {
        <!-- Tabs -->
        <div class="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
          @for (tab of tabs(); track tab.id) {
            <button
              type="button"
              (click)="activeTab.set(tab.id)"
              class="px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer"
              [ngClass]="activeTab() === tab.id ? 'bg-[#5865F2] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
            >
              {{ tab.label }}
            </button>
          }
        </div>

        <!-- Overview -->
        @if (activeTab() === 'overview') {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 class="text-sm font-bold text-white">📋 Tournament Details</h3>
              <div class="space-y-2 text-xs">
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Name</span><span class="font-bold text-white">{{ t.name }}</span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Type</span><span class="font-bold text-white">{{ t.type === 'DRAFT' ? 'FC Draft' : 'Standard' }}</span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Status</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">{{ statusLabel(t.status) }}</span>
                </div>
                @if (t.type === 'DRAFT') {
                  <div class="flex justify-between py-1.5 border-b border-slate-800">
                    <span class="text-slate-400">Formation</span><span class="font-bold text-white">{{ t.formation }}</span>
                  </div>
                }
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Signups</span><span class="font-bold text-white">{{ t.signups.length }}</span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-400">Teams</span><span class="font-bold text-white">{{ t.teams.length || '-' }}</span>
                </div>
                <div class="flex justify-between py-1.5">
                  <span class="text-slate-400">Matches played</span>
                  <span class="font-bold text-emerald-400">{{ playedCount() }} / {{ t.matches.length }}</span>
                </div>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed">{{ nextStepHint() }}</p>
            </div>

            <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 md:col-span-2">
              <h3 class="text-sm font-bold text-white">🤖 Discord Category & Channels</h3>
              @if (t.categoryId) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  @for (c of channelRows(); track c.label) {
                    <div class="p-3 bg-[#11192e] rounded-xl border border-slate-800">
                      <div class="text-slate-400 text-[10px] uppercase font-bold">{{ c.label }}</div>
                      <div class="font-mono text-white mt-0.5">{{ c.id || 'Not created' }}</div>
                    </div>
                  }
                </div>
              } @else {
                <div class="p-6 bg-[#11192e] rounded-xl border border-slate-800 text-center space-y-2">
                  <p class="text-xs text-slate-400">No Discord channels yet. Players sign up from the #registration channel, so create them before opening signups.</p>
                  <button (click)="provisionDiscordChannels()" [disabled]="busy()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50">
                    Create Discord category & channels
                  </button>
                </div>
              }
            </div>
          </div>
        }

        <!-- Signups -->
        @if (activeTab() === 'signups') {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-white">{{ t.type === 'DRAFT' ? 'Managers & Players' : 'Registered Teams' }}</h3>
                <p class="text-xs text-slate-400">
                  {{ t.type === 'DRAFT' ? 'Managers (with a team name) become draft teams; everyone else is in the draft pool.' : 'Teams in signup order. The first 8, 16 or 32 make the bracket.' }}
                </p>
              </div>
              <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">{{ t.signups.length }} signed up</span>
            </div>
            @if (t.signups.length === 0) {
              <div class="p-12 text-center text-slate-400 space-y-2">
                <div class="text-3xl">📝</div>
                <h4 class="text-sm font-bold text-white">No Signups Yet</h4>
                <p class="text-xs">People sign up with the Sign Up button in the tournament's #registration channel.</p>
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-[#16213e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th class="py-3 px-4">#</th>
                      <th class="py-3 px-4">{{ t.type === 'DRAFT' ? 'Player' : 'Captain' }}</th>
                      <th class="py-3 px-4">Gamertag</th>
                      @if (t.type === 'DRAFT') {
                        <th class="py-3 px-4 text-center">Positions</th>
                      }
                      <th class="py-3 px-4">{{ t.type === 'DRAFT' ? 'Manager of' : 'Team' }}</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/80">
                    @for (s of t.signups; track s.userId; let i = $index) {
                      <tr class="hover:bg-slate-800/30 transition" [ngClass]="s.isBackup ? 'opacity-50' : ''">
                        <td class="py-3 px-4 text-slate-500">{{ i + 1 }}</td>
                        <td class="py-3 px-4 font-bold text-white">{{ s.displayName || s.userId }}</td>
                        <td class="py-3 px-4 font-mono text-slate-300">{{ s.gamertag }}</td>
                        @if (t.type === 'DRAFT') {
                          <td class="py-3 px-4 text-center font-extrabold text-amber-400">{{ s.pos1 }}{{ s.pos2 ? ' / ' + s.pos2 : '' }}</td>
                        }
                        <td class="py-3 px-4 text-slate-300">
                          {{ s.teamName || '-' }}
                          @if (s.isBackup) { <span class="text-[10px] text-rose-300 ml-1">(cut from bracket)</span> }
                        </td>
                        <td class="py-3 px-4 text-right">
                          @if (canChangeSignups()) {
                            <button (click)="removeSignup(s.userId)" [disabled]="busy()" class="text-rose-400 hover:text-rose-300 font-bold text-xs disabled:opacity-50">Remove</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- Draft -->
        @if (activeTab() === 'draft' && t.type === 'DRAFT') {
          <div class="space-y-6">
            @if (!t.draft || t.teams.length === 0) {
              <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <div class="text-3xl">🎡</div>
                <h4 class="text-sm font-bold text-white">Draft not started</h4>
                <p class="text-xs">{{ managerCount() }} manager(s) and {{ t.signups.length - managerCount() }} player(s) signed up. At least 2 managers are needed. Use "Start draft" above.</p>
              </div>
            } @else {
              <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="text-xs space-y-1">
                  @if (t.draft.complete) {
                    <div class="text-sm font-bold text-emerald-400">🎉 Draft complete</div>
                  } @else {
                    <div class="text-sm font-bold text-white">On the clock: {{ onTheClock() }}</div>
                    @if (t.draft.currentCandidate) {
                      <div class="text-amber-300">Wheel drew {{ t.draft.currentCandidate.displayName }} for {{ t.draft.currentLockedPosition }}, waiting for the manager to confirm or use a joker.</div>
                    }
                  }
                  <div class="text-slate-400">Picks made: {{ t.draft.picks.length }} / {{ t.draft.snakeOrder.length }}</div>
                </div>
                @if (!t.draft.complete) {
                  <button (click)="autoDraft()" [disabled]="busy()" class="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-xs border border-rose-500/40 transition disabled:opacity-50">
                    ⚡ Auto-draft remaining picks
                  </button>
                }
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                @for (team of t.teams; track team.id; let idx = $index) {
                  <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-4 shadow-lg">
                    <div class="flex items-center justify-between mb-2">
                      <h4 class="text-sm font-bold text-white">{{ team.name }}</h4>
                      <span class="text-[10px] text-slate-400">🃏 {{ t.draft.teamJokers[idx] ?? 0 }}</span>
                    </div>
                    <ul class="text-xs space-y-1">
                      @for (p of team.picks; track p.userId) {
                        <li class="flex justify-between">
                          <span class="text-white">{{ p.displayName }}{{ p.isManager ? ' (M)' : '' }}</span>
                          <span class="font-bold text-amber-400">{{ p.position }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Fixtures & Results -->
        @if (activeTab() === 'results') {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-white">Fixtures & Results</h3>
                <p class="text-xs text-slate-400">Managers report scores in Discord. You can enter or correct any score here.</p>
              </div>
              <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">{{ playedCount() }} / {{ t.matches.length }} played</span>
            </div>
            @if (t.matches.length === 0) {
              <div class="p-12 text-center text-slate-400 space-y-2">
                <div class="text-2xl">⚽</div>
                <h4 class="text-sm font-bold text-white">No fixtures yet</h4>
                <p class="text-xs">Fixtures are generated when the tournament starts{{ t.type === 'DRAFT' ? ' and the draft ends' : '' }}.</p>
              </div>
            } @else {
              <div class="divide-y divide-slate-800/80">
                @for (m of t.matches; track m.id) {
                  <div class="p-3 flex items-center gap-3 hover:bg-slate-800/30 transition text-xs">
                    <span class="w-24 text-[10px] text-slate-500 shrink-0">{{ stageLabel(m) }}</span>
                    <span class="font-bold text-white flex-1 text-right truncate">{{ m.homeTeam }}</span>
                    @if (editingMatchId() === m.id) {
                      <input type="number" min="0" max="99" [(ngModel)]="editHome" class="w-12 bg-[#11192e] border border-slate-700 rounded-lg px-1 py-1 text-center text-white font-bold" />
                      <span class="text-slate-500">-</span>
                      <input type="number" min="0" max="99" [(ngModel)]="editAway" class="w-12 bg-[#11192e] border border-slate-700 rounded-lg px-1 py-1 text-center text-white font-bold" />
                      @if (m.stage === 'KNOCKOUT' && editHome === editAway) {
                        <span class="text-[10px] text-amber-300">pens</span>
                        <input type="number" min="0" max="99" [(ngModel)]="editHomePens" class="w-10 bg-[#11192e] border border-amber-700 rounded-lg px-1 py-1 text-center text-white" />
                        <input type="number" min="0" max="99" [(ngModel)]="editAwayPens" class="w-10 bg-[#11192e] border border-amber-700 rounded-lg px-1 py-1 text-center text-white" />
                      }
                    } @else {
                      <span class="px-3 py-1 rounded-lg bg-[#11192e] border border-slate-700 font-extrabold text-center min-w-[60px]" [ngClass]="m.completed ? 'text-white' : 'text-slate-500'">
                        {{ m.completed ? m.homeScore + ' - ' + m.awayScore : 'vs' }}
                        @if (m.completed && m.homePens != null) {
                          <span class="text-[10px] text-amber-300 font-semibold">({{ m.homePens }}-{{ m.awayPens }} p)</span>
                        }
                      </span>
                    }
                    <span class="font-bold text-white flex-1 text-left truncate">{{ m.awayTeam }}</span>
                    <span class="w-28 text-right shrink-0">
                      @if (editingMatchId() === m.id) {
                        <button (click)="saveScore(m)" [disabled]="busy()" class="text-emerald-400 hover:text-emerald-300 font-bold mr-2 disabled:opacity-50">Save</button>
                        <button (click)="editingMatchId.set(null)" class="text-slate-400 hover:text-white">Cancel</button>
                      } @else {
                        <button (click)="startEdit(m)" class="text-indigo-300 hover:text-indigo-200 font-bold">{{ m.completed ? 'Edit' : 'Enter score' }}</button>
                      }
                    </span>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Standings -->
        @if (activeTab() === 'standings') {
          <div class="space-y-6">
            @if (t.champion) {
              <div class="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 text-sm font-bold text-amber-300">🏆 Champion: {{ t.champion }}</div>
            }
            @if (t.format === 'GROUPS_KNOCKOUT') {
              <p class="text-xs text-slate-400">The top 2 of each group go through to the knockouts, which are drawn automatically after the last group match.</p>
            }
            <div class="grid gap-6" [ngClass]="t.groups.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'">
              @for (table of standingsTables(); track table.title) {
                <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  @if (table.title) {
                    <div class="px-4 py-2.5 bg-[#11192e] border-b border-slate-800 text-xs font-bold text-white">{{ table.title }}</div>
                  }
                  <table class="w-full text-left text-xs">
                    <thead class="bg-[#11192e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th class="py-3 px-4">#</th><th class="py-3 px-4">Team</th>
                        <th class="py-3 px-2 text-center">P</th><th class="py-3 px-2 text-center">W</th>
                        <th class="py-3 px-2 text-center">D</th><th class="py-3 px-2 text-center">L</th>
                        <th class="py-3 px-2 text-center">GD</th><th class="py-3 px-4 text-center">Pts</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/80">
                      @for (r of table.rows; track r.team) {
                        <tr [ngClass]="r.rank <= table.qualify ? 'bg-emerald-500/5' : ''">
                          <td class="py-2.5 px-4" [ngClass]="r.rank <= table.qualify ? 'text-emerald-400 font-bold' : 'text-slate-400'">{{ r.rank }}</td>
                          <td class="py-2.5 px-4 font-bold text-white">{{ r.team }}</td>
                          <td class="py-2.5 px-2 text-center text-slate-300">{{ r.played }}</td>
                          <td class="py-2.5 px-2 text-center text-slate-300">{{ r.wins }}</td>
                          <td class="py-2.5 px-2 text-center text-slate-300">{{ r.draws }}</td>
                          <td class="py-2.5 px-2 text-center text-slate-300">{{ r.losses }}</td>
                          <td class="py-2.5 px-2 text-center text-slate-300">{{ r.goalDifference }}</td>
                          <td class="py-2.5 px-4 text-center font-extrabold text-emerald-400">{{ r.points }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="8" class="p-8 text-center text-slate-400">The table fills in once the tournament starts.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
            @if (t.format === 'LEAGUE' && t.standings.length > 0) {
              <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-white">🖼️ Standings graphic (as posted in Discord)</h3>
                  <a [href]="standingsImageUrl()" target="_blank" class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition">Open Full Image</a>
                </div>
                <div class="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-4">
                  <img [src]="standingsImageUrl()" alt="Standings Table" class="max-w-full h-auto rounded-lg shadow-2xl" />
                </div>
              </div>
            }
          </div>
        }
      } @else {
        <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-16 text-center text-slate-400 space-y-4 shadow-xl">
          <div class="text-4xl">🏆</div>
          <h2 class="text-lg font-bold text-white">No Tournament Selected</h2>
          <p class="text-xs max-w-md mx-auto">Create a tournament to get its Discord channels, signups, fixtures and standings.</p>
          <button (click)="showCreateModal.set(true)" class="px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-extrabold text-xs shadow-lg transition inline-flex items-center gap-2">
            <span>➕</span><span>Create First Tournament</span>
          </button>
        </div>
      }

      <!-- Create Tournament Modal -->
      @if (showCreateModal()) {
        <div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-[#16213e] border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 class="text-sm font-bold text-white">🏆 Create New Tournament</h3>
              <button (click)="showCreateModal.set(false)" class="text-slate-400 hover:text-white font-bold text-xs">✕</button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Tournament Format</label>
                <select [(ngModel)]="newTournamentType" class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                  <option value="STANDARD">Standard Tournament (teams sign up)</option>
                  <option value="DRAFT">FC Draft Tournament (players sign up, managers draft)</option>
                </select>
                <p class="text-[10px] text-slate-400 mt-1">
                  Creates a Discord category <code>🏆 [Name]</code> with #info-rules, #announcements, #registration, #fixtures-results, #table-standings and #tournament-chat{{ newTournamentType === 'DRAFT' ? ', plus #draft-wheel' : '' }}.
                </p>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Tournament Name</label>
                <input type="text" [(ngModel)]="newTournamentName" maxlength="80"
                  [placeholder]="newTournamentType === 'STANDARD' ? 'e.g. RYVL Champions League Ed. 1' : 'e.g. Cupa României Draft Ed. 1'"
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              @if (newTournamentType === 'DRAFT') {
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Tactical Formation</label>
                  <select [(ngModel)]="newTournamentFormation" class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                    <option value="3-1-4-2">3-1-4-2 (Holding CDM & Twin Strikers)</option>
                    <option value="3-5-2">3-5-2 (Twin Strikers, CAM & Midfield)</option>
                  </select>
                </div>
              }
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" [(ngModel)]="provisionOnCreate" />
                Create the Discord channels now
              </label>
            </div>
            <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button type="button" (click)="showCreateModal.set(false)" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white">Cancel</button>
              <button type="button" (click)="createTournament()" [disabled]="busy() || !newTournamentName.trim()"
                class="px-5 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs shadow-lg transition flex items-center gap-2 disabled:opacity-50">
                {{ busy() ? 'Creating...' : 'Create Tournament' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminTournamentsComponent {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly tournaments = signal<TournamentInstance[]>([]);
  readonly selectedTournamentId = signal<string | null>(null);
  readonly activeTab = signal<Tab>('overview');
  readonly busy = signal(false);
  readonly showCreateModal = signal(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);
  readonly editingMatchId = signal<string | null>(null);

  newTournamentType: 'STANDARD' | 'DRAFT' = 'STANDARD';
  newTournamentName = '';
  newTournamentFormation = '3-1-4-2';
  provisionOnCreate = true;
  editHome = 0;
  editAway = 0;
  editHomePens: number | null = null;
  editAwayPens: number | null = null;

  readonly activeTournament = computed(() => {
    const id = this.selectedTournamentId();
    return this.tournaments().find((t) => t.id === id) || null;
  });

  readonly tabs = computed(() => {
    const t = this.activeTournament();
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: 'overview', label: '📊 Overview' },
      { id: 'signups', label: `📝 Signups (${t?.signups.length ?? 0})` },
    ];
    if (t?.type === 'DRAFT') tabs.push({ id: 'draft', label: '🎡 Draft' });
    tabs.push({ id: 'results', label: '⚽ Fixtures & Results' }, { id: 'standings', label: '📈 Standings' });
    return tabs;
  });

  readonly canChangeSignups = computed(() => {
    const status = this.activeTournament()?.status;
    return status === 'SIGNUPS_OPEN' || status === 'SIGNUPS_CLOSED';
  });

  readonly playedCount = computed(() => this.activeTournament()?.matches.filter((m) => m.completed).length ?? 0);
  readonly managerCount = computed(() => this.activeTournament()?.signups.filter((s) => s.isManager).length ?? 0);

  readonly onTheClock = computed(() => {
    const t = this.activeTournament();
    const draft = t?.draft;
    if (!t || !draft) return '';
    const idx = draft.snakeOrder[draft.currentTurn] ?? 0;
    return t.teams[idx]?.name ?? `Team ${idx + 1}`;
  });

  readonly channelRows = computed(() => {
    const t = this.activeTournament();
    if (!t) return [];
    const c = t.channels;
    const rows = [
      { label: 'Category', id: t.categoryId },
      { label: '#info-rules', id: c.info },
      { label: '#announcements', id: c.announcements },
      { label: '#registration', id: c.registration },
      { label: '#fixtures-results', id: c.fixtures },
      { label: '#table-standings', id: c.standings },
      { label: '#tournament-chat', id: c.chat },
    ];
    if (t.type === 'DRAFT') rows.push({ label: '#draft-wheel', id: c.draft });
    return rows;
  });

  readonly nextStepHint = computed(() => {
    const t = this.activeTournament();
    if (!t) return '';
    if (!t.categoryId) return 'Next: create the Discord channels so people can sign up.';
    switch (t.status) {
      case 'SIGNUPS_OPEN':
      case 'SIGNUPS_CLOSED':
        return t.type === 'DRAFT'
          ? `Next: when at least 2 managers have signed up (now ${this.managerCount()}), start the draft.`
          : `Next: when 8, 16 or 32 teams have signed up (now ${t.signups.length}), start the tournament.`;
      case 'DRAFTING':
        return 'The draft is running in #draft-wheel. Fixtures are created automatically when it ends.';
      case 'ACTIVE':
        return 'Managers report scores in #fixtures-results. The tournament completes when every fixture has a score.';
      default:
        return 'This tournament is finished.';
    }
  });

  readonly standingsTables = computed(() => {
    const t = this.activeTournament();
    if (!t) return [];
    if (t.groups.length > 0) {
      return t.groups.map((g) => ({ title: `Group ${g.group}`, rows: g.rows, qualify: 2 }));
    }
    return [{ title: '', rows: t.standings, qualify: 0 }];
  });

  /** Knockout rounds are named by how many matches they have (1 = final). */
  stageLabel(m: TournamentMatch): string {
    if (m.stage === 'GROUP') return `Group ${m.group}`;
    if (m.stage === 'KNOCKOUT') {
      const count = this.activeTournament()?.matches.filter((x) => x.stage === 'KNOCKOUT' && x.round === m.round).length ?? 0;
      return { 1: 'Final', 2: 'Semi-final', 4: 'Quarter-final', 8: 'Round of 16', 16: 'Round of 32' }[count] ?? 'Knockout';
    }
    return m.round ? `Round ${m.round}` : '';
  }

  readonly standingsImageUrl = computed(() => {
    const gId = this.guildStore.activeGuildId();
    const t = this.activeTournament();
    if (!gId || !t) return '';
    return `${this.api.baseUrl}/api/guilds/${gId}/tournaments/${t.id}/standings-image?v=${encodeURIComponent(t.updatedAt)}`;
  });

  private lastLoadedGuildId: string | null = null;

  constructor() {
    effect(() => {
      const guildId = this.guildStore.activeGuildId();
      if (guildId && guildId !== this.lastLoadedGuildId) {
        this.lastLoadedGuildId = guildId;
        this.selectedTournamentId.set(null);
        void this.loadTournaments(guildId);
      }
    });
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
  }

  async loadTournaments(guildId: string): Promise<void> {
    try {
      const list = (await this.api.getTournaments(guildId)) || [];
      this.tournaments.set(list);
      const current = this.selectedTournamentId();
      if (!current || !list.some((t) => t.id === current)) {
        this.selectedTournamentId.set(list[0]?.id ?? null);
      }
    } catch (err) {
      console.error('Failed to load tournaments:', err);
      this.showToast('Could not load tournaments.', 'error');
    }
  }

  private replaceTournament(updated: TournamentInstance): void {
    this.tournaments.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
  }

  /** Runs an action against the selected tournament with one busy flag and one error toast. */
  private async run(action: (guildId: string, tournamentId: string) => Promise<void>): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const tournamentId = this.selectedTournamentId();
    if (!guildId || !tournamentId || this.busy()) return;
    this.busy.set(true);
    try {
      await action(guildId, tournamentId);
    } catch (err: any) {
      this.showToast(this.errorText(err), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  async createTournament(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.newTournamentName.trim() || this.busy()) return;
    this.busy.set(true);
    try {
      const created = await this.api.createTournament(guildId, {
        name: this.newTournamentName.trim(),
        type: this.newTournamentType,
        formation: this.newTournamentFormation,
      });
      this.tournaments.update((list) => [created, ...list]);
      this.selectedTournamentId.set(created.id);
      this.activeTab.set('overview');
      this.showCreateModal.set(false);
      this.newTournamentName = '';
      if (this.provisionOnCreate) {
        await this.api.provisionTournamentDiscord(guildId, created.id);
        await this.loadTournaments(guildId);
      }
      this.showToast('Tournament created.', 'success');
    } catch (err: any) {
      this.showToast(this.errorText(err), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  provisionDiscordChannels(): Promise<void> {
    return this.run(async (g, id) => {
      await this.api.provisionTournamentDiscord(g, id);
      await this.loadTournaments(g);
      this.showToast('Discord category & channels are ready.', 'success');
    });
  }

  refreshDiscord(): Promise<void> {
    return this.run(async (g, id) => {
      this.replaceTournament(await this.api.refreshTournamentDiscord(g, id));
      this.showToast('Discord panels refreshed.', 'success');
    });
  }

  toggleSignups(): Promise<void> {
    return this.run(async (g, id) => {
      const updated = await this.api.toggleTournamentSignups(g, id);
      this.replaceTournament(updated);
      this.showToast(`Signups are now ${updated.status === 'SIGNUPS_OPEN' ? 'open' : 'closed'}.`, 'success');
    });
  }

  startTournament(): Promise<void> {
    const t = this.activeTournament();
    if (!t) return Promise.resolve();
    const question =
      t.type === 'DRAFT'
        ? 'Start the draft? Signups close and managers become teams.'
        : 'Start the tournament? Signups close, the bracket is fixed and fixtures are created.';
    if (!confirm(question)) return Promise.resolve();
    return this.run(async (g, id) => {
      const res = await this.api.startTournament(g, id);
      this.replaceTournament(res.tournament);
      this.activeTab.set(t.type === 'DRAFT' ? 'draft' : 'results');
      this.showToast(res.message, 'success');
    });
  }

  autoDraft(): Promise<void> {
    if (!confirm('Fill every remaining pick automatically and end the draft?')) return Promise.resolve();
    return this.run(async (g, id) => {
      this.replaceTournament(await this.api.autoDraftTournament(g, id));
      this.showToast('Draft completed and fixtures created.', 'success');
    });
  }

  removeSignup(userId: string): Promise<void> {
    return this.run(async (g, id) => {
      this.replaceTournament(await this.api.removeTournamentSignup(g, id, userId));
      this.showToast('Signup removed.', 'success');
    });
  }

  startEdit(m: TournamentMatch): void {
    this.editHome = m.completed ? m.homeScore : 0;
    this.editAway = m.completed ? m.awayScore : 0;
    this.editHomePens = m.homePens ?? null;
    this.editAwayPens = m.awayPens ?? null;
    this.editingMatchId.set(m.id);
  }

  saveScore(m: TournamentMatch): Promise<void> {
    return this.run(async (g, id) => {
      const res = await this.api.recordTournamentResult(g, id, {
        matchId: m.id,
        homeScore: Number(this.editHome),
        awayScore: Number(this.editAway),
        ...(m.stage === 'KNOCKOUT' && Number(this.editHome) === Number(this.editAway)
          ? { homePens: this.editHomePens, awayPens: this.editAwayPens }
          : {}),
      });
      this.replaceTournament(res.tournament);
      this.editingMatchId.set(null);
      this.showToast(
        res.completed
          ? 'Score saved. The tournament is complete!'
          : res.newStage?.length
            ? `Score saved. The next round is drawn (${res.newStage.length} matches).`
            : 'Score saved.',
        'success',
      );
    });
  }

  private errorText(err: any): string {
    const message = err?.error?.message ?? err?.message;
    return Array.isArray(message) ? message.join(', ') : message || 'Something went wrong.';
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
