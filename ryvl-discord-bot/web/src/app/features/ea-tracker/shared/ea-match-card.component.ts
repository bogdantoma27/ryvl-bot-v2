import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EA_DEFAULT_CREST, EaTheme, formatEaTimestamp } from './ea-format';

const THEMES = {
  admin: {
    card: 'bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:border-slate-700 transition',
    header: 'px-5 py-3.5 bg-[#11192e] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs',
    headerLeft: 'flex items-center gap-2.5',
    badge: 'px-2.5 py-0.5 rounded-full font-black text-[11px] tracking-wide',
    win: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    loss: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    draw: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    labels: { WIN: '🏆 VICTORY', LOSS: '💔 DEFEAT', DRAW: '🤝 DRAW' },
    type: 'text-slate-400 font-semibold',
    toggle: 'text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-950/40 transition cursor-pointer',
    toggleText: ['View Stats ▼', 'Hide Details ▲'],
    board: 'p-5 flex flex-col md:flex-row items-center justify-between gap-6',
    side: 'gap-4',
    name: 'text-sm font-black text-white',
    crest: 'w-12 h-12 object-contain rounded-xl bg-slate-900/50 p-1 border border-slate-700',
    scoreBox: 'flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-[#0f172a] border border-slate-700 shadow-inner order-2',
    score: 'text-2xl font-black',
    scoreWin: 'text-emerald-400',
    scoreOppWin: 'text-emerald-400',
    colon: 'text-slate-600 font-bold',
    details: 'px-5 pb-5 pt-2 border-t border-slate-800/80 bg-[#11192e]/60 space-y-5 animate-fadeIn',
    sectionTitle: 'text-xs font-bold uppercase tracking-wider text-slate-400',
    aggTitle: 'Team Aggregate Statistics',
    aggBox: 'bg-[#16213e] p-2.5 rounded-xl border border-slate-800',
    aggLabel: 'text-slate-400 text-[10px]',
    aggLabels: ['Shots on Target', 'Passes Completed', 'Tackles Made', 'Goalkeeper Saves'],
    squadSuffix: 'Squad Scorecard',
    tableWrap: 'overflow-x-auto',
    table: 'w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden',
    thead: 'bg-[#16213e] text-slate-400 text-[11px] uppercase font-bold',
    tbody: 'divide-y divide-slate-800/80 bg-[#11192e]',
    row: 'hover:bg-slate-800/40 transition',
    pos: 'py-2 px-3 text-slate-400 uppercase font-mono text-[10px]',
    goals: 'py-2 px-3 text-center font-bold text-white',
    assists: 'py-2 px-3 text-center font-bold text-white',
    muted: 'py-2 px-3 text-center text-slate-400',
  },
  public: {
    card: 'rounded-3xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/30 transition overflow-hidden shadow-xl',
    header: 'px-6 py-3.5 bg-[#121214] border-b border-white/5 flex items-center justify-between flex-wrap gap-2 text-xs',
    headerLeft: 'flex items-center gap-3',
    badge: 'px-3 py-1 rounded-full font-black text-[11px] tracking-wide',
    win: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    loss: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    draw: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    labels: { WIN: '🟢 VICTORY', LOSS: '🔴 DEFEAT', DRAW: '⚪ DRAW' },
    type: 'text-slate-300 font-semibold',
    toggle: 'text-xs text-[#EAE905] hover:text-[#d8d704] font-bold px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer',
    toggleText: ['View Squad Stats ▼', 'Hide Squad Stats ▲'],
    board: 'p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6',
    side: 'gap-5',
    name: 'text-base sm:text-lg font-black text-white uppercase tracking-tight',
    crest: 'w-14 h-14 object-contain rounded-2xl bg-black/60 p-1.5 border border-white/10 shrink-0',
    scoreBox: 'flex items-center gap-4 px-8 py-3 rounded-2xl bg-[#141419] border border-white/10 shadow-inner order-2',
    score: 'text-3xl font-black font-mono',
    scoreWin: 'text-[#EAE905]',
    scoreOppWin: 'text-rose-400',
    colon: 'text-slate-500 font-bold text-xl',
    details: 'px-6 pb-6 pt-3 border-t border-white/10 bg-[#121214] space-y-6 animate-fadeIn',
    sectionTitle: 'text-xs font-mono font-bold uppercase tracking-wider text-[#EAE905]',
    aggTitle: 'Match statistics',
    aggBox: 'bg-[#18181c] p-3 rounded-xl border border-white/5',
    aggLabel: 'text-slate-400 text-[10px] uppercase font-mono',
    aggLabels: ['Shots on Target', 'Passes Completed', 'Tackles Won', 'Saves'],
    squadSuffix: 'Player Performance',
    tableWrap: 'overflow-x-auto rounded-xl border border-white/10',
    table: 'w-full text-left text-xs',
    thead: 'bg-[#18181c] text-slate-400 text-[10px] uppercase font-bold border-b border-white/10',
    tbody: 'divide-y divide-white/5 bg-[#141419]',
    row: 'hover:bg-white/5 transition',
    pos: 'py-2 px-3 text-slate-400 font-mono text-[11px] uppercase',
    goals: 'py-2 px-3 text-center font-bold text-emerald-400',
    assists: 'py-2 px-3 text-center font-bold text-sky-400',
    muted: 'py-2 px-3 text-center text-slate-300',
  },
} as const;

/** One parsed EA match (scoreboard + expandable team and player stats), shared by the admin tracker and the public club page. */
@Component({
  selector: 'app-ea-match-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @let m = match();
    @let c = cls();
    <div [class]="c.card">
      <div [class]="c.header">
        <div [class]="c.headerLeft">
          <span
            [class]="c.badge"
            [ngClass]="m.outcome === 'WIN' ? c.win : m.outcome === 'LOSS' ? c.loss : c.draw"
          >
            {{ m.outcome === 'WIN' ? c.labels.WIN : m.outcome === 'LOSS' ? c.labels.LOSS : c.labels.DRAW }}
          </span>
          <span [class]="c.type">{{ m.matchTypeLabel || 'Pro Clubs Match' }}</span>
          <span class="text-slate-600">•</span>
          <span class="text-slate-400">{{ formatTimestamp(m.timestamp) }}</span>
        </div>
        <button type="button" (click)="toggle.emit(m.matchId)" [class]="c.toggle">
          {{ expanded() ? c.toggleText[1] : c.toggleText[0] }}
        </button>
      </div>

      <div [class]="c.board">
        <div class="flex items-center flex-1 justify-end order-1 md:order-1 text-right" [ngClass]="c.side">
          <div>
            <div [class]="c.name">{{ m.trackedClub.name }}</div>
            <div class="text-[11px] text-slate-400">{{ m.trackedPlayers.length }} Players Rated</div>
          </div>
          <img [src]="m.trackedClub.crestUrl || defaultCrest" alt="Tracked Crest" [class]="c.crest" />
        </div>

        <div [class]="c.scoreBox">
          <span [class]="c.score" [ngClass]="m.trackedClub.score > m.opponentClub.score ? c.scoreWin : 'text-white'">
            {{ m.trackedClub.score }}
          </span>
          <span [class]="c.colon">:</span>
          <span [class]="c.score" [ngClass]="m.opponentClub.score > m.trackedClub.score ? c.scoreOppWin : 'text-white'">
            {{ m.opponentClub.score }}
          </span>
        </div>

        <div class="flex items-center flex-1 order-3" [ngClass]="c.side">
          <img [src]="m.opponentClub.crestUrl || defaultCrest" alt="Opponent Crest" [class]="c.crest" />
          <div>
            <div [class]="c.name">{{ m.opponentClub.name }}</div>
            <div class="text-[11px] text-slate-400">Club ID: {{ m.opponentClub.id }}</div>
          </div>
        </div>
      </div>

      @if (expanded()) {
        <div [class]="c.details">
          @if (m.trackedClub.aggregate || m.opponentClub.aggregate) {
            <div>
              <h4 class="mb-3" [ngClass]="c.sectionTitle">{{ c.aggTitle }}</h4>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div [class]="c.aggBox">
                  <div [class]="c.aggLabel">{{ c.aggLabels[0] }}</div>
                  <div class="text-sm font-bold text-white mt-1">
                    {{ m.trackedClub.aggregate?.shots ?? 0 }} vs {{ m.opponentClub.aggregate?.shots ?? 0 }}
                  </div>
                </div>
                <div [class]="c.aggBox">
                  <div [class]="c.aggLabel">{{ c.aggLabels[1] }}</div>
                  <div class="text-sm font-bold text-white mt-1">
                    {{ m.trackedClub.aggregate?.passesmade ?? 0 }} / {{ m.trackedClub.aggregate?.passattempts ?? 0 }}
                  </div>
                </div>
                <div [class]="c.aggBox">
                  <div [class]="c.aggLabel">{{ c.aggLabels[2] }}</div>
                  <div class="text-sm font-bold text-white mt-1">
                    {{ m.trackedClub.aggregate?.tacklesmade ?? 0 }} vs {{ m.opponentClub.aggregate?.tacklesmade ?? 0 }}
                  </div>
                </div>
                <div [class]="c.aggBox">
                  <div [class]="c.aggLabel">{{ c.aggLabels[3] }}</div>
                  <div class="text-sm font-bold text-white mt-1">
                    {{ m.trackedClub.aggregate?.saves ?? 0 }} vs {{ m.opponentClub.aggregate?.saves ?? 0 }}
                  </div>
                </div>
              </div>
            </div>
          }

          @if (m.trackedPlayers.length > 0) {
            <div>
              <h4 class="mb-2" [ngClass]="c.sectionTitle">{{ m.trackedClub.name }} {{ c.squadSuffix }}</h4>
              <div [class]="c.tableWrap">
                <table [class]="c.table">
                  <thead [class]="c.thead">
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
                  <tbody [class]="c.tbody">
                    @for (p of m.trackedPlayers; track p.gamertag) {
                      <tr [class]="c.row">
                        <td class="py-2 px-3 font-semibold text-white flex items-center gap-1.5">
                          @if (p.isMom) {
                            <span title="Man of the Match" class="text-amber-400">⭐</span>
                          }
                          <span>{{ p.gamertag }}</span>
                        </td>
                        <td [class]="c.pos">{{ p.position }}</td>
                        <td
                          class="py-2 px-3 text-center font-extrabold"
                          [ngClass]="theme() === 'public' ? 'text-[#EAE905]' : p.rating >= 8.0 ? 'text-emerald-400' : p.rating >= 7.0 ? 'text-sky-400' : 'text-slate-300'"
                        >
                          {{ formatRating(p.rating) }}
                        </td>
                        <td [class]="c.goals">{{ p.goals || '-' }}</td>
                        <td [class]="c.assists">{{ p.assists || '-' }}</td>
                        <td [class]="c.muted">{{ p.passesMade }}/{{ p.passAttempts }}</td>
                        <td [class]="c.muted">{{ p.tacklesMade }}/{{ p.tackleAttempts }}</td>
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
export class EaMatchCardComponent {
  readonly match = input.required<any>();
  readonly theme = input<EaTheme>('admin');
  readonly expanded = input(false);
  readonly toggle = output<string>();

  readonly defaultCrest = EA_DEFAULT_CREST;
  readonly cls = computed(() => THEMES[this.theme()]);
  readonly formatTimestamp = formatEaTimestamp;

  formatRating(rating: unknown): string {
    const n = Number(rating);
    return Number.isFinite(n) ? n.toFixed(1) : '-';
  }
}
