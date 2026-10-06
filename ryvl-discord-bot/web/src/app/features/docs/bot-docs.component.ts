import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface BotCommandDoc {
  name: string;
  category: 'tournaments' | 'ea' | 'vpg' | 'lineups' | 'events' | 'admin';
  categoryLabel: string;
  syntax: string;
  description: string;
  permission: 'Everyone' | 'Admin' | 'Captain / Manager';
  parameters?: Array<{ name: string; required: boolean; description: string }>;
  example: string;
  responsePreview?: string;
}

const BOT_COMMANDS: BotCommandDoc[] = [
  // Tournaments
  {
    name: '/tournament create',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: '/tournament create <name> [type] [formation]',
    description:
      'Creates a Standard or FC Draft tournament with its own category: #info-rules, #announcements, #registration, #fixtures-results, #table-standings, #tournament-chat, plus #draft-wheel for drafts. /create_tournament does the same with Standard as the default type.',
    permission: 'Admin',
    parameters: [
      { name: 'name', required: true, description: 'Tournament title' },
      { name: 'type', required: false, description: 'draft (default) or standard' },
      { name: 'formation', required: false, description: 'Draft formation: 3-5-2 or 3-1-4-2' },
    ],
    example: '/tournament create name:"RYVL Super Cup" type:standard',
    responsePreview: '🏆 Turneu creat: RYVL Super Cup, with links to every channel',
  },
  {
    name: 'Sign Up button (#registration)',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: 'Sign Up / Pull Out buttons',
    description:
      'Standard: the captain registers a team name and gamertag. Draft: players register gamertag and main/secondary position; filling the team name signs you up as a manager. Pulling out is possible until the tournament starts.',
    permission: 'Everyone',
    example: 'Click Sign Up in #registration',
    responsePreview: '✅ Te-ai înscris în draft cu gamertag-ul GT (ST).',
  },
  {
    name: '/tournament start',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: '/tournament start',
    description:
      'Closes signups and starts play. Standard: the bracket auto-scales to 8, 16 or 32 teams in signup order (extra teams are told by DM) and a round-robin fixture list is posted. Draft: managers become teams and the draft wheel starts in #draft-wheel. Also on the admin panel as Start Tournament / Draft.',
    permission: 'Admin',
    example: '/tournament start',
    responsePreview: '🚀 Draftul a început: 4 echipe, 40 jucători disponibili pentru 40 alegeri.',
  },
  {
    name: 'Draft wheel buttons (#draft-wheel)',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: 'Spin Wheel → pick a free position → Confirm Pick or Use Joker',
    description:
      'The manager on the clock picks one of their free formation slots and the wheel draws a random player for it (main position first, then secondary, then anyone left). Each team has 4 jokers to re-spin. Snake order. When the draft ends, rosters and fixtures are posted automatically. Admins can Auto-Draft the rest.',
    permission: 'Captain / Manager',
    example: 'Click Spin Wheel, choose ST',
    responsePreview: '🎰 Alpha a învârtit roata pentru ST: Alex (Alex_ST9)',
  },
  {
    name: '/tournament draft-status',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: '/tournament draft-status',
    description:
      "Shows whose turn it is, picks made and each team's roster and jokers.",
    permission: 'Everyone',
    example: '/tournament draft-status',
    responsePreview: '🎡 Draft — Cupa Draft: La rând: Beta, Alegeri 12 / 40',
  },
  {
    name: 'Report Score button (#fixtures-results)',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: 'Report Score → pick your fixture → enter both scores',
    description:
      'Managers/captains report the score of their own pending fixtures; admins can report any. Fixtures, standings image and the final winner announcement update automatically.',
    permission: 'Captain / Manager',
    example: 'Click Report Score',
    responsePreview: '⚽ Rezultat: Alpha 3 - 1 Beta',
  },
  {
    name: '/tournament toggle-signups',
    category: 'tournaments',
    categoryLabel: '🏆 Tournaments & Draft',
    syntax: '/tournament toggle-signups',
    description:
      'Opens or closes registration before the tournament starts. Other admin commands: set-status, notify, generate-standings, setup-admin (posts the admin button panel).',
    permission: 'Admin',
    example: '/tournament toggle-signups',
    responsePreview: '⚡ Înscrierile pentru Cupa Draft sunt acum SIGNUPS_CLOSED.',
  },

  // EA SPORTS FC 27 Pro Clubs
  {
    name: '/club-stats',
    category: 'ea',
    categoryLabel: '⚽ EA Pro Clubs Tracker',
    syntax: '/club-stats [club_id]',
    description: 'View real-time EA SPORTS FC 27 Pro Clubs club record, skill rating, current division, and goals.',
    permission: 'Everyone',
    parameters: [
      { name: 'club_id', required: false, description: 'EA Club ID (defaults to active tracked club)' },
    ],
    example: '/club-stats club_id:128199',
    responsePreview: '📊 Club: RYVL Esports | Record: 142W - 18D - 35L | Win Rate: 72.8% | Division: 1 | Skill: 2,450',
  },
  {
    name: '/club-matches',
    category: 'ea',
    categoryLabel: '⚽ EA Pro Clubs Tracker',
    syntax: '/club-matches [count]',
    description: 'Display recent match scorecards, opponent details, match timestamps, and MOTM stats.',
    permission: 'Everyone',
    parameters: [
      { name: 'count', required: false, description: 'Number of recent matches (default: 5, max: 10)' },
    ],
    example: '/club-matches count:5',
    responsePreview: '⚽ Recent Match: RYVL Esports 4 - 1 Primetime FC | Goals: Mihai (2), Denis (2) | MOTM: Denis (9.4 rating)',
  },
  {
    name: '/register-player',
    category: 'ea',
    categoryLabel: '⚽ EA Pro Clubs Tracker',
    syntax: '/register-player <user> <ea_gamertag> [position]',
    description: 'Map a Discord server member to their exact EA SPORTS FC Pro Clubs gamertag for individual statistics.',
    permission: 'Admin',
    parameters: [
      { name: 'user', required: true, description: '@mention or Discord User ID' },
      { name: 'ea_gamertag', required: true, description: 'Exact EA FC Gamertag' },
      { name: 'position', required: false, description: 'Primary preferred position (ST, CAM, CM, CDM, CB, GK)' },
    ],
    example: '/register-player user:@Alex ea_gamertag:AlexRO_9 position:ST',
    responsePreview: '🛡️ Linked @Alex to EA Gamertag "AlexRO_9" (Position: ST). Security audit log created.',
  },
  {
    name: '/player-stats',
    category: 'ea',
    categoryLabel: '⚽ EA Pro Clubs Tracker',
    syntax: '/player-stats <gamertag_or_user>',
    description: 'Display personal statistics, matches played, goals, assists, average match rating, pass accuracy, and tackle rates.',
    permission: 'Everyone',
    parameters: [
      { name: 'gamertag_or_user', required: true, description: 'EA Gamertag or @user mention' },
    ],
    example: '/player-stats gamertag:AlexRO_9',
    responsePreview: '⭐ AlexRO_9 (ST): 54 Matches | 62 Goals | 21 Assists | Rating: 8.7 | Pass Rate: 84% | MOTM Awards: 14',
  },

  // VPG Competitions & Transfers
  {
    name: '/vpg-transfers',
    category: 'vpg',
    categoryLabel: '🔄 VPG Transfers & Leaks',
    syntax: '/vpg-transfers [league] [limit]',
    description: 'Fetch the latest verified VPG transfer announcements with fees, dates, and club badges.',
    permission: 'Everyone',
    parameters: [
      { name: 'league', required: false, description: 'League slug (searchable in dashboard or VPG API)' },
      { name: 'limit', required: false, description: 'Number of transfers (default: 5, max: 20)' },
    ],
    example: '/vpg-transfers league:Superliga-Romania limit:5',
    responsePreview: '⚽ HERE WE GO: Mihai -> RYVL Esports (Fee: Free Agent) • Official VPG Verification',
  },
  {
    name: '/vpg-totw',
    category: 'vpg',
    categoryLabel: '🔄 VPG Transfers & Leaks',
    syntax: '/vpg-totw [league] [formation]',
    description: 'Render and post the high-resolution Team of the Week pitch graphic featuring 12 top players, avatars, and nameplates.',
    permission: 'Admin',
    parameters: [
      { name: 'league', required: false, description: 'League slug' },
      { name: 'formation', required: false, description: 'Pitch formation: 3-5-2 or 3-1-4-2' },
    ],
    example: '/vpg-totw league:Superliga-Romania formation:3-5-2',
    responsePreview: '⭐ Generated and posted official Team of the Week graphic to configured announcement channel!',
  },
  {
    name: '/vpg-standings',
    category: 'vpg',
    categoryLabel: '🔄 VPG Transfers & Leaks',
    syntax: '/vpg-standings [league] [season]',
    description: 'Display the latest official VPG league table, points, goal difference, and match records.',
    permission: 'Everyone',
    parameters: [
      { name: 'league', required: false, description: 'League slug' },
      { name: 'season', required: false, description: 'Season number' },
    ],
    example: '/vpg-standings league:Superliga-Romania',
    responsePreview: '🏆 VPG Superliga Standings: 1. RYVL Esports (36 pts) | 2. Primetime (31 pts) | 3. FC Bucharest (28 pts)',
  },

  // Lineup Builder
  {
    name: '/lineup create',
    category: 'lineups',
    categoryLabel: '📋 Lineup Builder & Tactics',
    syntax: '/lineup create <opponent> <formation>',
    description: 'Open the interactive 11v11 pitch lineup builder with tactical positions, starters, and bench reserves.',
    permission: 'Captain / Manager',
    parameters: [
      { name: 'opponent', required: true, description: 'Opposing club name' },
      { name: 'formation', required: true, description: 'Formation (e.g. 3-5-2, 3-1-4-2, 4-2-3-1)' },
    ],
    example: '/lineup create opponent:"Primetime FC" formation:"3-5-2"',
    responsePreview: '📋 Starting Lineup Builder: Click positions on the graphic to assign registered Discord players.',
  },

  // Events & Scheduling
  {
    name: '/event create',
    category: 'events',
    categoryLabel: '📅 Events & Attendance',
    syntax: '/event create <title> <date_time> [type] [channel]',
    description: 'Schedule team training, trials, or tournament matches with interactive Attend / Tentative / Decline buttons.',
    permission: 'Admin',
    parameters: [
      { name: 'title', required: true, description: 'Event title' },
      { name: 'date_time', required: true, description: 'Date and time (e.g. 2026-10-05 21:00)' },
      { name: 'type', required: false, description: 'MATCH, TRAINING, or TRIAL' },
      { name: 'channel', required: false, description: 'Announcement channel' },
    ],
    example: '/event create title:"Official League Match vs Primetime" date_time:"2026-10-01 22:00"',
    responsePreview: '📅 Event Created: Official League Match vs Primetime. Voting chips active: [✅ Attend] [❔ Tentative] [❌ Absent]',
  },

  // Configuration
  {
    name: '/config channels',
    category: 'admin',
    categoryLabel: '⚙️ Administration & Configuration',
    syntax: '/config channels',
    description: 'Inspect and configure default notification channels for transfers, fixtures, standings, lineups, and results.',
    permission: 'Admin',
    example: '/config channels',
    responsePreview: '⚙️ Channel Config: Lineups: #lineups | Transfers: #transfers | Fixtures: #fixtures | Standings: #standings',
  },
];

@Component({
  selector: 'app-bot-docs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-8 pb-16 animate-fadeIn">
      <!-- Hero Banner -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#1a274a] to-[#16213e] border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-3xl">📖</span>
              <h1 class="text-3xl font-black text-white tracking-tight">RYVL Bot Documentation</h1>
              <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Commands & Guides
              </span>
            </div>
            <p class="text-sm text-slate-300 mt-2 max-w-2xl">
              Complete command directory and interactive reference for Discord server administrators, managers, and players.
              Use the search bar or category filters to explore features.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <a
              routerLink="/admin/dashboard"
              class="px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
            >
              <span>⚡</span>
              <span>Open Admin Console</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Quick Feature Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-800 shadow space-y-2">
          <div class="text-2xl">🏆</div>
          <div class="text-sm font-bold text-white">Tournaments & FC Draft</div>
          <p class="text-xs text-slate-400">
            MultiBots-style automated category and channels, interactive draft wheel with jokers, 3-5-2 and 3-1-4-2 formations.
          </p>
        </div>

        <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-800 shadow space-y-2">
          <div class="text-2xl">⚽</div>
          <div class="text-sm font-bold text-white">Multi-Club EA FC Tracker</div>
          <p class="text-xs text-slate-400">
            Auto-polls EA FC 27 Pro Clubs servers every 90s, posts match stats and MOTM cards to dedicated Discord channels.
          </p>
        </div>

        <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-800 shadow space-y-2">
          <div class="text-2xl">⭐</div>
          <div class="text-sm font-bold text-white">Team of the Week (TOTW)</div>
          <p class="text-xs text-slate-400">
            Automated weekly cron generates high-resolution 12-player pitch cards with Discord player avatars and nameplates.
          </p>
        </div>

        <div class="p-5 rounded-2xl bg-[#16213e] border border-slate-800 shadow space-y-2">
          <div class="text-2xl">🔄</div>
          <div class="text-sm font-bold text-white">VPG Transfers & Feeds</div>
          <p class="text-xs text-slate-400">
            Instant transfer announcements with "HERE WE GO" cards, transfer fees, club badges, and player history.
          </p>
        </div>
      </div>

      <!-- Search and Filter Bar -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <!-- Search Input -->
        <div class="relative flex-1">
          <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search commands, syntax, or keywords (e.g. tournament, ea, totw, lineup)..."
            class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          @if (searchQuery()) {
            <button
              (click)="searchQuery.set('')"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          }
        </div>

        <!-- Category Pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            (click)="selectedCategory.set('all')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'all' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            All Commands ({{ allCommands.length }})
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('tournaments')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'tournaments' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            🏆 Tournaments
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('ea')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'ea' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            ⚽ EA FC Tracker
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('vpg')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'vpg' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            🔄 VPG Feeds
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('lineups')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'lineups' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            📋 Lineups
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('events')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'events' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            📅 Events
          </button>
          <button
            type="button"
            (click)="selectedCategory.set('admin')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            [ngClass]="selectedCategory() === 'admin' ? 'bg-[#5865F2] text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'"
          >
            ⚙️ Admin
          </button>
        </div>
      </div>

      <!-- Commands Directory -->
      <div class="space-y-4">
        @if (filteredCommands().length === 0) {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
            <div class="text-3xl">🔍</div>
            <h4 class="text-base font-bold text-white">No commands match "{{ searchQuery() }}"</h4>
            <p class="text-xs">Try searching for keywords like "draft", "stats", "channel", or "goal".</p>
          </div>
        } @else {
          @for (cmd of filteredCommands(); track cmd.name) {
            <div class="bg-[#16213e] border border-slate-800 hover:border-slate-700 rounded-2xl p-6 shadow-xl transition space-y-4">
              <!-- Command Header Bar -->
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div class="flex items-center gap-3 flex-wrap">
                  <code class="px-2.5 py-1 rounded-xl bg-[#11192e] text-indigo-400 font-mono font-black text-sm border border-slate-700">
                    {{ cmd.name }}
                  </code>
                  <span class="text-xs font-semibold text-slate-400">{{ cmd.categoryLabel }}</span>
                </div>

                <div class="flex items-center gap-2">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                    [ngClass]="cmd.permission === 'Admin' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : cmd.permission === 'Captain / Manager' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'"
                  >
                    {{ cmd.permission }}
                  </span>
                  <button
                    type="button"
                    (click)="copyToClipboard(cmd.example)"
                    class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                    title="Copy command example"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <!-- Description -->
              <p class="text-xs text-slate-300 leading-relaxed">{{ cmd.description }}</p>

              <!-- Parameters (if any) -->
              @if (cmd.parameters && cmd.parameters.length > 0) {
                <div class="space-y-1.5 pt-1">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parameters:</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    @for (param of cmd.parameters; track param.name) {
                      <div class="p-2.5 rounded-xl bg-[#11192e] border border-slate-800/80 flex items-start gap-2">
                        <code class="text-emerald-400 font-mono text-[11px] shrink-0 font-bold">
                          {{ param.required ? '<' + param.name + '>' : '[' + param.name + ']' }}
                        </code>
                        <span class="text-slate-400 text-[11px]">{{ param.description }}</span>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Example and Response Preview -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div class="p-3 rounded-xl bg-[#11192e] border border-slate-800 space-y-1">
                  <div class="text-[10px] uppercase font-bold text-slate-500">Command Usage Example:</div>
                  <code class="text-xs font-mono text-indigo-300 block select-all break-all">{{ cmd.example }}</code>
                </div>

                @if (cmd.responsePreview) {
                  <div class="p-3 rounded-xl bg-[#11192e] border border-slate-800 space-y-1">
                    <div class="text-[10px] uppercase font-bold text-emerald-400">Bot Response Preview:</div>
                    <div class="text-xs text-slate-300 italic">{{ cmd.responsePreview }}</div>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.2s ease-out forwards;
    }
  `],
})
export class BotDocsComponent {
  readonly allCommands = BOT_COMMANDS;
  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string>('all');

  readonly filteredCommands = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.allCommands.filter((cmd) => {
      const matchCat = cat === 'all' || cmd.category === cat;
      if (!matchCat) return false;

      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.syntax.toLowerCase().includes(q) ||
        cmd.example.toLowerCase().includes(q)
      );
    });
  });

  copyToClipboard(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }
}
