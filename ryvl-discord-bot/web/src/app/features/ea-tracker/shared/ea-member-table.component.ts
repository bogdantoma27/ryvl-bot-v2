import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EaTheme } from './ea-format';

const THEMES = {
  admin: {
    card: 'bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg',
    header: 'p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between',
    title: 'text-sm font-bold text-white',
    count: 'text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold',
    thead: 'bg-[#16213e] text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800',
    tbody: 'divide-y divide-slate-800/80',
    row: 'hover:bg-slate-800/30 transition',
    nameCell: 'py-3 px-4 font-bold text-white flex items-center gap-2',
    avatar: 'w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-300 font-bold',
    rating: 'py-3 px-4 text-center font-extrabold text-white',
    gamesHeader: 'Games',
  },
  public: {
    card: 'rounded-3xl bg-[#0c0c0e] border border-white/10 overflow-hidden shadow-2xl',
    header: 'p-6 bg-[#121214] border-b border-white/10 flex items-center justify-between flex-wrap gap-4',
    title: 'text-lg font-semibold text-white tracking-tight',
    count: 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30',
    thead: 'bg-[#16161a] text-slate-400 text-[10px] uppercase font-bold border-b border-white/10',
    tbody: 'divide-y divide-white/5 bg-[#0c0c0e]',
    row: 'hover:bg-white/5 transition',
    nameCell: 'py-3 px-4 font-bold text-white flex items-center gap-3',
    avatar: 'w-8 h-8 rounded-xl bg-[#141419] border border-white/10 flex items-center justify-center text-xs font-black text-[#EAE905]',
    rating: 'py-3 px-4 text-center font-extrabold text-[#EAE905]',
    gamesHeader: 'Matches',
  },
} as const;

/** EA club member leaderboard table, shared by the admin tracker and the public club page. */
@Component({
  selector: 'app-ea-member-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cls();
    <div [class]="c.card">
      <div [class]="c.header">
        <div>
          <h3 [class]="c.title">{{ heading() }}</h3>
          @if (subheading()) {
            <p class="text-xs text-slate-400">{{ subheading() }}</p>
          }
        </div>
        <span [class]="c.count">{{ members().length }} Registered Players</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead [class]="c.thead">
            <tr>
              <th class="py-3 px-4">Player</th>
              <th class="py-3 px-4 text-center">{{ c.gamesHeader }}</th>
              <th class="py-3 px-4 text-center">Goals</th>
              <th class="py-3 px-4 text-center">Assists</th>
              <th class="py-3 px-4 text-center">MOTM</th>
              <th class="py-3 px-4 text-center">Avg Rating</th>
              <th class="py-3 px-4 text-center">Pass %</th>
              <th class="py-3 px-4 text-center">Tackle %</th>
            </tr>
          </thead>
          <tbody [class]="c.tbody">
            @for (m of members(); track m.name) {
              <tr [class]="c.row">
                <td [class]="c.nameCell">
                  <div [class]="c.avatar">{{ (m.name || '').slice(0, 2).toUpperCase() }}</div>
                  <span>{{ m.name }}</span>
                </td>
                <td class="py-3 px-4 text-center font-semibold text-slate-200">{{ m.gamesPlayed || 0 }}</td>
                <td class="py-3 px-4 text-center font-bold text-emerald-400">{{ m.goals || 0 }}</td>
                <td class="py-3 px-4 text-center font-bold text-sky-400">{{ m.assists || 0 }}</td>
                <td class="py-3 px-4 text-center font-bold text-amber-400">{{ m.manOfTheMatch || 0 }}</td>
                <td [class]="c.rating">{{ formatRating(m) }}</td>
                <td class="py-3 px-4 text-center text-slate-300">{{ m.passSuccessRate || 0 }}%</td>
                <td class="py-3 px-4 text-center text-slate-300">{{ m.tackleSuccessRate || 0 }}%</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class EaMemberTableComponent {
  readonly members = input<any[]>([]);
  readonly theme = input<EaTheme>('admin');
  readonly heading = input('Club Roster & Leaderboard');
  readonly subheading = input<string | null>(null);

  readonly cls = computed(() => THEMES[this.theme()]);

  formatRating(member: any): string {
    // EA's member stats call the average rating "ratingAve"; older payloads used "rating".
    const value = Number(member?.ratingAve ?? member?.rating);
    return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '-';
  }
}
