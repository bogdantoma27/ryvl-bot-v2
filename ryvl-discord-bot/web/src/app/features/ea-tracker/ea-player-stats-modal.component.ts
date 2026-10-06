import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatEaTimestamp } from './shared/ea-format';

/** Modal for GET api/guilds/:guildId/ea/players/:identifier/stats. */
@Component({
  selector: 'app-ea-player-stats-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = stats();
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-[#16213e] border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-base font-black text-white flex items-center gap-2">
              <span>⭐</span>
              <span>{{ s.eaPlayerName || 'Player Stats' }}</span>
            </h3>
            <span class="text-xs text-emerald-400 font-semibold">{{ s.preferredPos || 'PRO CLUBS' }}</span>
          </div>
          <button (click)="closed.emit()" class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Games</div>
            <div class="text-lg font-black text-white mt-1">{{ s.totalMatches || 0 }}</div>
          </div>
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Goals</div>
            <div class="text-lg font-black text-emerald-400 mt-1">{{ s.goals || 0 }}</div>
          </div>
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Assists</div>
            <div class="text-lg font-black text-sky-400 mt-1">{{ s.assists || 0 }}</div>
          </div>
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Avg Rating</div>
            <div class="text-lg font-black text-amber-400 mt-1">{{ s.totalMatches ? s.avgRating : '-' }}</div>
          </div>
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Pass Rate</div>
            <div class="text-lg font-black text-white mt-1">{{ s.passAccuracy || 0 }}%</div>
          </div>
          <div class="bg-[#11192e] p-3 rounded-xl border border-slate-800 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold">Tackle Rate</div>
            <div class="text-lg font-black text-white mt-1">{{ s.tackleSuccessRate || 0 }}%</div>
          </div>
        </div>

        <p class="text-[11px] text-slate-400">
          Based on all {{ s.totalMatches || 0 }} tracked match(es) for this server's clubs
          @if (s.firstMatchAt) {
            since {{ formatTimestamp(s.firstMatchAt) }}
          }
          • MOTM {{ s.momAwards || 0 }} • Clean sheets {{ s.cleanSheets || 0 }}
        </p>

        <div class="flex justify-end pt-2">
          <button
            (click)="closed.emit()"
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `,
})
export class EaPlayerStatsModalComponent {
  readonly stats = input.required<any>();
  readonly closed = output<void>();
  readonly formatTimestamp = formatEaTimestamp;
}
