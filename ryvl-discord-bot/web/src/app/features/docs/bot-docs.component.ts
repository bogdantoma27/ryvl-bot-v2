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
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BotCommandDoc as RegisteredCommand } from '../../core/models';

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

const CATEGORY_BY_COMMAND: Record<string, BotCommandDoc['category']> = {
  tournament: 'tournaments',
  create_tournament: 'tournaments',
  ea_setup: 'ea',
  ea_stats: 'ea',
  ea_latest: 'ea',
  stats: 'ea',
  'register-player': 'ea',
  'unregister-player': 'ea',
  track_team: 'ea',
  team_stats: 'ea',
  vpg_transfers: 'vpg',
  superliga: 'vpg',
  live_results: 'vpg',
  totw: 'vpg',
  superliga_mvp: 'vpg',
  ryvl: 'vpg',
  lineup_post: 'lineups',
  event: 'events',
};

const CATEGORY_LABELS: Record<BotCommandDoc['category'], string> = {
  tournaments: '🏆 Tournaments & Draft',
  ea: '⚽ EA Pro Clubs Tracker',
  vpg: '🔄 VPG Superliga & Feeds',
  lineups: '📋 Lineup Builder & Tactics',
  events: '📅 Events & Attendance',
  admin: '⚙️ Administration & Configuration',
};

/** Turns one registered slash command into a docs entry. */
export function toCommandDoc(cmd: RegisteredCommand): BotCommandDoc {
  const category = CATEGORY_BY_COMMAND[cmd.command] || 'admin';
  const syntax = [
    cmd.name,
    ...cmd.options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)),
  ].join(' ');
  return {
    name: cmd.name,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    syntax,
    description: cmd.description,
    permission: cmd.adminOnly ? 'Admin' : 'Everyone',
    parameters: cmd.options.map((o) => ({
      name: o.name,
      required: o.required,
      description: o.choices?.length ? `${o.description} (${o.choices.join(', ')})` : `${o.description} (${o.type})`,
    })),
    example: syntax,
  };
}

// Hand-written guides for the tournament flow (buttons and richer descriptions). Every
// other entry on this page is generated from the slash commands the bot registers.
const TOURNAMENT_GUIDES: BotCommandDoc[] = [
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
            All Commands ({{ allCommands().length }})
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
        @if (loading()) {
          <p class="text-xs text-slate-400" role="status">Loading the bot's registered commands…</p>
        } @else if (loadError()) {
          <p class="text-xs text-amber-300" role="status">
            The live command list could not be loaded; only the tournament guides are shown. Type / in Discord to see every command.
          </p>
        }
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
                  <div class="text-[10px] uppercase font-bold text-slate-500">Usage:</div>
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
export class BotDocsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly registered = signal<BotCommandDoc[]>([]);
  readonly loadError = signal<boolean>(false);
  readonly loading = signal<boolean>(true);

  readonly allCommands = computed(() => {
    const guides = new Set(TOURNAMENT_GUIDES.map((g) => g.name));
    return [...TOURNAMENT_GUIDES, ...this.registered().filter((cmd) => !guides.has(cmd.name))];
  });

  async ngOnInit(): Promise<void> {
    try {
      const commands = await this.api.getBotCommands();
      this.registered.set(commands.map(toCommandDoc));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string>('all');

  readonly filteredCommands = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.allCommands().filter((cmd) => {
      // "Admin" lists every command that needs Manage Server, whatever its feature area.
      const matchCat = cat === 'all' || cmd.category === cat || (cat === 'admin' && cmd.permission === 'Admin');
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
